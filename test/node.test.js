/**
 * Structural tests for the built node.
 *
 * They run against dist/, need no n8n instance and no API key, and catch the mistakes
 * that otherwise only show up as a broken parameter panel inside the n8n editor.
 *
 *   npm run build && npm test
 */
const assert = require('node:assert/strict');
const { test, describe, before } = require('node:test');

const { ApiMaster } = require('../dist/nodes/ApiMaster/ApiMaster.node.js');
const { ApiMasterApi } = require('../dist/credentials/ApiMasterApi.credentials.js');

let node;
let description;

before(() => {
	node = new ApiMaster();
	description = node.description;
});

describe('node description', () => {
	test('declares the fields n8n requires', () => {
		for (const field of ['displayName', 'name', 'group', 'version', 'description', 'defaults']) {
			assert.ok(description[field], `missing ${field}`);
		}
		assert.equal(description.name, 'apiMaster');
		assert.equal(description.icon, 'file:apiMaster.svg');
		assert.deepEqual(description.inputs, ['main']);
		assert.deepEqual(description.outputs, ['main']);
	});

	test('requires the credential', () => {
		assert.deepEqual(description.credentials, [{ name: 'apiMasterApi', required: true }]);
	});

	test('offers chat, image and video', () => {
		const resource = description.properties.find((p) => p.name === 'resource');
		assert.deepEqual(
			resource.options.map((o) => o.value),
			['chat', 'image', 'video'],
		);
	});
});

describe('parameters', () => {
	const visibleFor = (resource, operation) =>
		description.properties.filter((property) => {
			const show = property.displayOptions?.show;
			if (!show) return true;
			if (show.resource && !show.resource.includes(resource)) return false;
			if (show.operation && operation && !show.operation.includes(operation)) return false;
			return true;
		});

	test('no duplicate parameter names are visible at the same time', () => {
		for (const [resource, operation] of [
			['chat', 'message'],
			['image', 'generate'],
			['video', 'generate'],
			['video', 'get'],
		]) {
			const names = visibleFor(resource, operation).map((p) => p.name);
			const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
			assert.deepEqual(duplicates, [], `${resource}/${operation} shows duplicates: ${duplicates}`);
		}
	});

	test('every resource exposes a prompt and a model selector', () => {
		for (const resource of ['chat', 'image', 'video']) {
			const names = visibleFor(resource, 'generate').concat(visibleFor(resource, 'message')).map((p) => p.name);
			assert.ok(names.includes('prompt'), `${resource} has no prompt`);
			assert.ok(names.includes('model'), `${resource} has no model`);
			assert.ok(names.includes('modelOverride'), `${resource} has no modelOverride escape hatch`);
		}
	});

	test('every displayOptions references a resource that exists', () => {
		const resources = description.properties
			.find((p) => p.name === 'resource')
			.options.map((o) => o.value);
		for (const property of description.properties) {
			for (const value of property.displayOptions?.show?.resource ?? []) {
				assert.ok(resources.includes(value), `${property.name} references unknown resource ${value}`);
			}
		}
	});

	test('option lists are sorted by name, as the n8n linter requires', () => {
		const check = (options, label) => {
			const names = options.filter((o) => o.name).map((o) => o.name);
			if (names.length < 3) return; // the linter only enforces this for longer lists
			const sorted = [...names].sort((a, b) => a.localeCompare(b));
			assert.deepEqual(names, sorted, `${label} is not alphabetised`);
		};
		const size = description.properties.find((p) => p.name === 'size');
		check(size.options, 'size');
	});

	test('video generate defaults to waiting but can be turned off', () => {
		const wait = description.properties.find((p) => p.name === 'waitForCompletion');
		assert.equal(wait.default, true);
		const maxWait = description.properties.find((p) => p.name === 'maxWaitMinutes');
		assert.deepEqual(maxWait.displayOptions.show.waitForCompletion, [true]);
	});

	test('the aspect ratio field warns about the portrait trap', () => {
		const aspect = description.properties.find((p) => p.name === 'aspectRatio');
		assert.match(aspect.description, /16:9/);
		assert.match(aspect.description, /reference image/i);
	});
});

describe('codex metadata', () => {
	// Without ApiMaster.node.json the node loads but has no category, so it is hard to
	// find in the node panel and shows no docs links. n8n strips it unless gulp copies
	// the file into dist, which is easy to break.
	const fs = require('node:fs');
	const path = require('node:path');
	const codexPath = path.join(__dirname, '..', 'dist', 'nodes', 'ApiMaster', 'ApiMaster.node.json');

	test('the codex file is emitted into dist', () => {
		assert.ok(fs.existsSync(codexPath), 'run `npm run build` — gulp must copy *.json into dist');
	});

	test('it declares a category and documentation links', () => {
		const codex = JSON.parse(fs.readFileSync(codexPath, 'utf8'));
		assert.ok(codex.categories.length > 0);
		assert.ok(codex.resources.primaryDocumentation[0].url.startsWith('http'));
		assert.ok(codex.resources.credentialDocumentation[0].url.startsWith('http'));
	});

	test('the icon file is emitted next to the compiled node', () => {
		const icon = path.join(__dirname, '..', 'dist', 'nodes', 'ApiMaster', 'apiMaster.svg');
		assert.ok(fs.existsSync(icon), 'n8n resolves file:apiMaster.svg relative to dist');
	});
});

describe('loadOptions', () => {
	test('one method per resource, matching the parameter definitions', () => {
		const methods = Object.keys(node.methods.loadOptions);
		assert.deepEqual(methods.sort(), ['getChatModels', 'getImageModels', 'getVideoModels']);
		const referenced = description.properties
			.filter((p) => p.typeOptions?.loadOptionsMethod)
			.map((p) => p.typeOptions.loadOptionsMethod);
		for (const method of referenced) {
			assert.ok(methods.includes(method), `parameter references missing method ${method}`);
		}
	});
});

describe('credential', () => {
	const credential = new ApiMasterApi();

	test('sends a bearer token', () => {
		assert.equal(
			credential.authenticate.properties.headers.Authorization,
			'=Bearer {{$credentials.apiKey}}',
		);
	});

	test('the API key is stored as a password', () => {
		const apiKey = credential.properties.find((p) => p.name === 'apiKey');
		assert.equal(apiKey.typeOptions.password, true);
		assert.equal(apiKey.required, true);
	});

	test('the credential test hits the model list', () => {
		assert.equal(credential.test.request.url, '/models');
		assert.equal(credential.test.request.baseURL, '={{$credentials.baseUrl}}');
	});

	test('the default base URL keeps the /v1 suffix', () => {
		const baseUrl = credential.properties.find((p) => p.name === 'baseUrl');
		assert.match(baseUrl.default, /\/v1$/);
	});
});
