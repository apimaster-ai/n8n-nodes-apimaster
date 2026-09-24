import type { INodeProperties } from 'n8n-workflow';

const showFor = (resource: string, operation?: string[]) => ({
	show: {
		resource: [resource],
		...(operation ? { operation } : {}),
	},
});

/** Every resource offers a free-text override: dropdowns go stale when a catalog changes. */
const modelOverride = (resource: string): INodeProperties => ({
	displayName: 'Model ID Override',
	name: 'modelOverride',
	type: 'string',
	default: '',
	placeholder: 'gpt-5.5',
	description:
		'Use an exact model ID instead of the list. Useful for a model added after this node was released.',
	displayOptions: showFor(resource),
});

export const chatFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Message',
				value: 'message',
				description: 'Send a prompt and get a completion',
				action: 'Send a message',
			},
		],
		default: 'message',
		displayOptions: showFor('chat'),
	},
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getChatModels' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: showFor('chat'),
	},
	modelOverride('chat'),
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showFor('chat'),
	},
	{
		displayName: 'System Prompt',
		name: 'systemPrompt',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		displayOptions: showFor('chat'),
	},
	{
		displayName: 'Message History (JSON)',
		name: 'messageHistory',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		placeholder: '[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]',
		description:
			'Earlier turns, as a JSON array. This gateway keeps no server-side conversation state, so multi-turn chat only works if you send the full history each time.',
		displayOptions: showFor('chat'),
	},
	{
		displayName: 'Options',
		name: 'chatOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor('chat'),
		options: [
			{
				displayName: 'JSON Output',
				name: 'jsonOutput',
				type: 'boolean',
				default: false,
				description: 'Whether to ask the model for a JSON object and parse it into the item',
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 1024,
				typeOptions: { minValue: 1 },
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.7,
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
			},
			{
				displayName: 'Top P',
				name: 'topP',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
			},
		],
	},
];

export const imageFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Generate an image from a prompt',
				action: 'Generate an image',
			},
		],
		default: 'generate',
		displayOptions: showFor('image'),
	},
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getImageModels' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: showFor('image'),
	},
	modelOverride('image'),
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showFor('image'),
	},
	{
		displayName: 'Size',
		name: 'size',
		type: 'options',
		default: '1:1',
		options: [
			{ name: 'Auto', value: 'auto' },
			{ name: 'Cinematic (21:9)', value: '21:9' },
			{ name: 'Landscape (16:9)', value: '16:9' },
			{ name: 'Landscape (4:3)', value: '4:3' },
			{ name: 'Portrait (3:4)', value: '3:4' },
			{ name: 'Portrait (9:16)', value: '9:16' },
			{ name: 'Square (1:1)', value: '1:1' },
		],
		displayOptions: showFor('image'),
	},
	{
		displayName: 'Resolution',
		name: 'resolution',
		type: 'options',
		default: '1k',
		options: [
			{ name: '1K', value: '1k' },
			{ name: '2K', value: '2k' },
			{ name: '4K', value: '4k' },
		],
		displayOptions: showFor('image'),
	},
	{
		displayName: 'Submit and Poll',
		name: 'useAsync',
		type: 'boolean',
		default: false,
		description:
			'Whether to submit the job and poll for the result instead of waiting on one request. Recommended for 2K and 4K, where a single request can exceed the gateway timeout and return a 408.',
		displayOptions: showFor('image'),
	},
	{
		displayName: 'Download Result',
		name: 'downloadResult',
		type: 'boolean',
		default: true,
		description: 'Whether to download the image into a binary property. Media URLs expire.',
		displayOptions: showFor('image'),
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: { resource: ['image'], downloadResult: [true] },
		},
	},
	{
		displayName: 'Options',
		name: 'imageOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor('image'),
		options: [
			{
				displayName: 'Mask URL',
				name: 'maskUrl',
				type: 'string',
				default: '',
				description:
					'Mask for inpainting. Must match the first reference image in size and carry an alpha channel.',
			},
			{
				displayName: 'Number of Images',
				name: 'numberOfImages',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 8 },
			},
			{
				displayName: 'Reference Image URLs',
				name: 'referenceImages',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/a.png, https://example.com/b.png',
				description: 'Comma-separated URLs for image-to-image. Up to 16.',
			},
		],
	},
];

export const videoFields: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Generate a video from a prompt',
				action: 'Generate a video',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Check a previously submitted job',
				action: 'Get a video job',
			},
		],
		default: 'generate',
		displayOptions: showFor('video'),
	},
	{
		displayName: 'Task ID',
		name: 'taskId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showFor('video', ['get']),
	},
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVideoModels' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Model ID Override',
		name: 'modelOverride',
		type: 'string',
		default: '',
		placeholder: 'sora-2-pro',
		description: 'Use an exact model ID instead of the list',
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Duration (Seconds)',
		name: 'duration',
		type: 'options',
		default: 4,
		options: [
			{ name: '4', value: 4 },
			{ name: '8', value: 8 },
			{ name: '12', value: 12 },
			{ name: '16', value: 16 },
			{ name: '20', value: 20 },
		],
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Resolution',
		name: 'videoResolution',
		type: 'options',
		default: '720p',
		options: [
			{ name: '720p', value: '720p' },
			{ name: '1024p (Pro Models Only)', value: '1024p' },
			{ name: '1080p (Pro Models Only)', value: '1080p' },
		],
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Aspect Ratio',
		name: 'aspectRatio',
		type: 'options',
		default: '16:9',
		options: [
			{ name: 'Landscape (16:9)', value: '16:9' },
			{ name: 'Portrait (9:16)', value: '9:16' },
		],
		description:
			'Always set this when using a reference image: a portrait reference with no aspect ratio is treated as 16:9',
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Reference Image URL',
		name: 'referenceImage',
		type: 'string',
		default: '',
		description: 'Public URL of an image for image-to-video',
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to poll until the video is ready. Turn this off for long jobs and check them later with the Get operation.',
		displayOptions: showFor('video', ['generate']),
	},
	{
		displayName: 'Max Wait (Minutes)',
		name: 'maxWaitMinutes',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1, maxValue: 30 },
		displayOptions: {
			show: { resource: ['video'], operation: ['generate'], waitForCompletion: [true] },
		},
	},
	{
		displayName: 'Download Result',
		name: 'downloadResult',
		type: 'boolean',
		default: true,
		description: 'Whether to download the MP4 into a binary property',
		displayOptions: showFor('video'),
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: { resource: ['video'], downloadResult: [true] },
		},
	},
];
