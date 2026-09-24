import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { chatFields, imageFields, videoFields } from './descriptions';

/** Read timeouts per resolution tier. A short one aborts jobs you are billed for anyway. */
const IMAGE_TIMEOUT: Record<string, number> = { '1k': 200000, '2k': 320000, '4k': 620000 };

const VIDEO_RE = /(sora|video|kling|seedance|minimax-h|veo|wan)/i;
const IMAGE_RE = /(image|banana|seedream|flux|dall|imagen|midjourney|mj_)/i;
const NON_CHAT_RE = /(image|video|sora|seedance|kling|banana|seedream|embedding|rerank|whisper|tts)/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ApiMaster implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'APIMaster',
		name: 'apiMaster',
		icon: 'file:apiMaster.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Chat, image and video generation through an OpenAI-compatible gateway',
		defaults: { name: 'APIMaster' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'apiMasterApi', required: true }],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Chat', value: 'chat' },
					{ name: 'Image', value: 'image' },
					{ name: 'Video', value: 'video' },
				],
				default: 'chat',
			},
			...chatFields,
			...imageFields,
			...videoFields,
		],
	};

	methods = {
		loadOptions: {
			async getChatModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return listModels.call(this, (id) => !NON_CHAT_RE.test(id));
			},
			async getImageModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return listModels.call(this, (id) => IMAGE_RE.test(id));
			},
			async getVideoModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return listModels.call(this, (id) => VIDEO_RE.test(id));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let output: INodeExecutionData;
				if (resource === 'chat') {
					output = await runChat.call(this, i);
				} else if (resource === 'image') {
					output = await runImage.call(this, i);
				} else {
					output = await runVideo.call(this, i);
				}
				output.pairedItem = { item: i };
				returnData.push(output);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

// --------------------------------------------------------------------------- helpers

async function request(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	options: IHttpRequestOptions,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('apiMasterApi');
	const baseUrl = String(credentials.baseUrl ?? 'https://apimaster.ai/v1').replace(/\/+$/, '');
	return (await this.helpers.httpRequestWithAuthentication.call(this, 'apiMasterApi', {
		...options,
		url: options.url.startsWith('http') ? options.url : `${baseUrl}${options.url}`,
		json: options.json ?? true,
	})) as IDataObject;
}

async function listModels(
	this: ILoadOptionsFunctions,
	keep: (id: string) => boolean,
): Promise<INodePropertyOptions[]> {
	const response = await request.call(this, { method: 'GET', url: '/models' });
	const data = (response.data as IDataObject[]) ?? [];
	const options = data
		.map((model) => String(model.id ?? ''))
		.filter((id) => id && keep(id))
		.sort()
		.map((id) => ({ name: id, value: id }));
	if (!options.length) {
		// Better than an empty dropdown the user cannot explain.
		return [{ name: 'No Models Found', value: '' }];
	}
	return options;
}

function modelId(this: IExecuteFunctions, index: number): string {
	const selected = this.getNodeParameter('model', index) as string;
	const override = this.getNodeParameter('modelOverride', index, '') as string;
	const id = (override || selected || '').trim();
	if (!id) {
		throw new NodeOperationError(
			this.getNode(),
			'No model selected. Pick one from the list, or type an id in "Model ID Override".',
			{ itemIndex: index },
		);
	}
	return id;
}

async function downloadToBinary(
	this: IExecuteFunctions,
	url: string,
	fileName: string,
	index: number,
): Promise<INodeExecutionData['binary']> {
	const credentials = await this.getCredentials('apiMasterApi');
	const baseUrl = String(credentials.baseUrl ?? '');
	// Compare hosts, not path prefixes: generated media comes back from the same domain
	// but outside /v1, while an upstream CDN rejects an unknown Authorization header.
	const sameHost = (() => {
		try {
			return new URL(url).host === new URL(baseUrl).host;
		} catch {
			return false;
		}
	})();

	const buffer = (await (sameHost
		? this.helpers.httpRequestWithAuthentication.call(this, 'apiMasterApi', {
				method: 'GET',
				url,
				encoding: 'arraybuffer',
				json: false,
			})
		: this.helpers.httpRequest({
				method: 'GET',
				url,
				encoding: 'arraybuffer',
				json: false,
			}))) as Buffer;

	const binaryProperty = this.getNodeParameter('binaryPropertyName', index, 'data') as string;
	return {
		[binaryProperty]: await this.helpers.prepareBinaryData(Buffer.from(buffer), fileName),
	};
}

// ------------------------------------------------------------------------------ chat

async function runChat(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
	const prompt = this.getNodeParameter('prompt', index) as string;
	const systemPrompt = this.getNodeParameter('systemPrompt', index, '') as string;
	const options = this.getNodeParameter('chatOptions', index, {}) as IDataObject;

	const messages: IDataObject[] = [];
	if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

	// Multi-turn only works if the whole history goes out every time: this gateway does
	// not hold conversation state server-side.
	const history = this.getNodeParameter('messageHistory', index, '') as string;
	if (history) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(history);
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Message History is not valid JSON: ${(error as Error).message}`,
				{ itemIndex: index },
			);
		}
		if (!Array.isArray(parsed)) {
			throw new NodeOperationError(
				this.getNode(),
				'Message History must be a JSON array of {role, content} objects',
				{ itemIndex: index },
			);
		}
		messages.push(...(parsed as IDataObject[]));
	}
	messages.push({ role: 'user', content: prompt });

	const body: IDataObject = { model: modelId.call(this, index), messages };
	if (options.temperature !== undefined) body.temperature = options.temperature;
	if (options.maxTokens) body.max_tokens = options.maxTokens;
	if (options.topP !== undefined) body.top_p = options.topP;
	if (options.jsonOutput) body.response_format = { type: 'json_object' };

	const response = await request.call(this, {
		method: 'POST',
		url: '/chat/completions',
		body,
		timeout: 180000,
	});

	const choices = (response.choices as IDataObject[]) ?? [];
	const message = (choices[0]?.message as IDataObject) ?? {};
	const content = String(message.content ?? '');

	if (options.jsonOutput) {
		try {
			return { json: { ...(JSON.parse(content) as IDataObject), _usage: response.usage } };
		} catch {
			// Not every model honours json_object; returning the raw text beats throwing.
			return { json: { content, usage: response.usage, warning: 'Response was not valid JSON' } };
		}
	}

	return {
		json: {
			content,
			model: response.model,
			usage: response.usage,
			finishReason: choices[0]?.finish_reason,
		},
	};
}

// ----------------------------------------------------------------------------- image

async function runImage(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
	const prompt = this.getNodeParameter('prompt', index) as string;
	const resolution = this.getNodeParameter('resolution', index, '1k') as string;
	const options = this.getNodeParameter('imageOptions', index, {}) as IDataObject;
	const useAsync = this.getNodeParameter('useAsync', index, false) as boolean;
	const download = this.getNodeParameter('downloadResult', index, true) as boolean;
	const model = modelId.call(this, index);

	const body: IDataObject = { model, prompt, resolution };
	const size = this.getNodeParameter('size', index, '') as string;
	if (size && size !== 'auto') body.size = size;
	if (options.numberOfImages) body.n = options.numberOfImages;
	if (options.referenceImages) {
		body.image_urls = String(options.referenceImages)
			.split(',')
			.map((url) => url.trim())
			.filter(Boolean);
	}
	if (options.maskUrl) body.mask_url = options.maskUrl;

	let urls: string[] = [];

	if (useAsync) {
		const submit = await request.call(this, {
			method: 'POST',
			url: '/images/generations/async',
			body,
			timeout: 60000,
		});
		const taskId = ((submit.data as IDataObject[]) ?? [])[0]?.task_id as string;
		if (!taskId) {
			throw new NodeOperationError(this.getNode(), `No task_id in response: ${JSON.stringify(submit)}`, {
				itemIndex: index,
			});
		}
		await sleep(12000);
		for (let attempt = 0; attempt < 200; attempt++) {
			const status = await request.call(this, {
				method: 'GET',
				url: `/tasks/${encodeURIComponent(taskId)}`,
				qs: { model },
				timeout: 30000,
			});
			const payload = ((status.data as IDataObject) ?? status) as IDataObject;
			const state = payload.status as string;
			if (state === 'completed') {
				const images = ((payload.result as IDataObject)?.images as IDataObject[]) ?? [];
				urls = images.flatMap((image) =>
					Array.isArray(image.url) ? (image.url as string[]) : image.url ? [image.url as string] : [],
				);
				break;
			}
			if (['failed', 'error', 'cancelled'].includes(state)) {
				throw new NodeApiError(this.getNode(), payload as never, {
					message: `Image task ${state}`,
					itemIndex: index,
				});
			}
			await sleep(4000);
		}
	} else {
		const response = await request.call(this, {
			method: 'POST',
			url: '/images/generations',
			body,
			timeout: IMAGE_TIMEOUT[resolution] ?? 200000,
		});
		urls = ((response.data as IDataObject[]) ?? [])
			.map((item) => item.url as string)
			.filter(Boolean);
	}

	if (!urls.length) {
		throw new NodeOperationError(this.getNode(), 'The endpoint returned no image URL', {
			itemIndex: index,
		});
	}

	const json: IDataObject = { model, prompt, urls, url: urls[0] };
	if (!download) return { json };

	const binary = await downloadToBinary.call(this, urls[0], `${model}-${Date.now()}.png`, index);
	return { json, binary };
}

// ----------------------------------------------------------------------------- video

async function runVideo(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
	const operation = this.getNodeParameter('operation', index) as string;
	const download = this.getNodeParameter('downloadResult', index, true) as boolean;

	if (operation === 'get') {
		const taskId = this.getNodeParameter('taskId', index) as string;
		const status = await request.call(this, {
			method: 'GET',
			url: `/videos/${encodeURIComponent(taskId)}`,
			timeout: 30000,
		});
		if (status.status !== 'completed' || !download) return { json: status };
		const url = (status.url as string) ?? '';
		const binary = await downloadToBinary.call(this, url, `${taskId}.mp4`, index);
		return { json: status, binary };
	}

	const model = modelId.call(this, index);
	const body: IDataObject = {
		model,
		prompt: this.getNodeParameter('prompt', index) as string,
		duration: this.getNodeParameter('duration', index, 4) as number,
		resolution: this.getNodeParameter('videoResolution', index, '720p') as string,
		// Explicit on purpose: a portrait reference with no aspect comes back 16:9.
		aspect_ratio: this.getNodeParameter('aspectRatio', index, '16:9') as string,
	};
	const reference = this.getNodeParameter('referenceImage', index, '') as string;
	if (reference) body.image_urls = [reference];

	const submit = await request.call(this, {
		method: 'POST',
		url: '/videos/generations',
		body,
		timeout: 60000,
	});
	const taskId =
		(((submit.data as IDataObject[]) ?? [])[0]?.task_id as string) ?? (submit.id as string);
	if (!taskId) {
		throw new NodeOperationError(this.getNode(), `No task id in response: ${JSON.stringify(submit)}`, {
			itemIndex: index,
		});
	}

	const wait = this.getNodeParameter('waitForCompletion', index, true) as boolean;
	if (!wait) {
		return { json: { taskId, status: 'submitted', model, hint: 'Poll it later with the "Get" operation' } };
	}

	const maxMinutes = this.getNodeParameter('maxWaitMinutes', index, 10) as number;
	const deadline = Date.now() + maxMinutes * 60000;
	await sleep(15000);

	while (Date.now() < deadline) {
		const status = await request.call(this, {
			method: 'GET',
			url: `/videos/${encodeURIComponent(taskId)}`,
			timeout: 30000,
		});
		const state = status.status as string;
		if (state === 'completed') {
			const credentials = await this.getCredentials('apiMasterApi');
			const baseUrl = String(credentials.baseUrl ?? '').replace(/\/+$/, '');
			const url = (status.url as string) || `${baseUrl}/videos/${taskId}/content`;
			const json: IDataObject = { taskId, model, status: state, url };
			if (!download) return { json };
			const binary = await downloadToBinary.call(this, url, `${model}-${taskId}.mp4`, index);
			return { json, binary };
		}
		if (['failed', 'error', 'cancelled'].includes(state)) {
			throw new NodeApiError(this.getNode(), status as never, {
				message: `Video task ${state}`,
				itemIndex: index,
			});
		}
		await sleep(4000);
	}

	throw new NodeOperationError(
		this.getNode(),
		`Video was still rendering after ${maxMinutes} minutes. Task ${taskId} is not lost — turn off "Wait for Completion" and poll it with the "Get" operation instead.`,
		{ itemIndex: index },
	);
}
