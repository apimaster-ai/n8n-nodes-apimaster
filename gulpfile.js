const path = require('path');
const { task, src, dest } = require('gulp');

// n8n serves node icons from dist/, but tsc only emits .js — copy the SVGs across.
task('build:icons', copyIcons);

function copyIcons() {
	// .json picks up the codex files (ApiMaster.node.json) as well as the icons:
	// tsc does not emit them, and without them the node has no category in the panel.
	const nodeSource = path.resolve('nodes', '**', '*.{png,svg,json}');
	const nodeDestination = path.resolve('dist', 'nodes');
	src(nodeSource).pipe(dest(nodeDestination));

	const credSource = path.resolve('credentials', '**', '*.{png,svg}');
	const credDestination = path.resolve('dist', 'credentials');
	return src(credSource, { allowEmpty: true }).pipe(dest(credDestination));
}
