import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ApiMasterApi implements ICredentialType {
	name = 'apiMasterApi';

	displayName = 'APIMaster API';

	// The rule expects a docs slug, which only exists for built-in nodes. A community
	// package has to point somewhere real, so a full URL is correct here.
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://apimaster.ai/docs/getting-started/api-key';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create one in the console. Keys pasted with a trailing newline cause a 401.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://apimaster.ai/v1',
			required: true,
			description:
				'OpenAI-compatible base URL, including /v1. Point this at any other compatible gateway to use the same node.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Makes the "Test" button in the credential dialog do something real: if this fails,
	// the key or the base URL is wrong and no workflow will work either.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/models',
			method: 'GET',
		},
	};
}
