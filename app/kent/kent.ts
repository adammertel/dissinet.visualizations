import * as d3 from 'd3';
import * as d3force from 'd3-force';
var style = require('./style.scss');

import { getSSData } from '../spreadsheet';

console.log('kent start');

// edges
// docs.google.com/spreadsheets/d/1oU4fwqaUgSnbv9NTjAQbSIooF9J5axzt5MfYCPWEhWE/edit#gid=1338507045
const tableEdgesId = '1AxApzeVYdh5xEyrYCIMC3ARUbpXIRq2I5mDmNmVzsYY/1';

// nodes
// docs.google.com/spreadsheets/d/1rIcda6bQeEallBHNzjQvvaedReqtW5DWxoUw30dCecQ/edit#gid=1016955786
const tableNodesId = '1oU4fwqaUgSnbv9NTjAQbSIooF9J5axzt5MfYCPWEhWE/2';

getSSData(tableEdgesId).then((links) => {
	getSSData(tableNodesId).then((nodes) => {
		console.log('links', links);
		console.log('nodes', nodes);

		/*
      setting data into sna form
    */

		const typeColors = [ '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854' ];
		const familyColors = [ '#e41a1c', '#377eb8', '#4daf4a', '#ffff33', '#a65628', 'dimgrey' ];

		const gNodes = nodes.filter((n) => n.degree !== '0').map((node) => {
			return { ...node, id: parseInt(node.idold) };
		});

		const linksFiltered = links
			.map((link) => {
				const source = gNodes.find((n) => n.id == link.source);
				const target = gNodes.find((n) => n.id == link.target);
				if (source && target) {
					const ids = [ gNodes.indexOf(source), gNodes.indexOf(target) ].sort((a, b) => (a < b ? -1 : 1));
					return { ...link, source: ids[0], target: ids[1] };
				} else return false;
			})
			.filter((l) => l);
		//	.filter((l) => l.classificationlevel1 !== 'kinship');

		const linkTypes = linksFiltered.map((l) => l.classificationlevel1).filter((v, i, a) => a.indexOf(v) === i);

		const familyNames = gNodes.map((n) => n.familyname).filter((v, i, a) => a.indexOf(v) === i);
		const familyNamesFreqs = {};
		familyNames.forEach((fname) => {
			familyNamesFreqs[fname] = gNodes.filter((n) => n.familyname === fname).length;
		});

		const familyNamesGroups = [];
		Object.keys(familyNamesFreqs).forEach((familyName) => {
			if (familyNamesFreqs[familyName] > 2) {
				familyNamesGroups.push(familyName);
			}
		});

		const gLinks = [];

		linksFiltered.forEach((link) => {
			const gLink = gLinks.find((gLink) => gLink.source === link.source && gLink.target === link.target);
			if (gLink) {
				gLink.edges.push(link);
			} else {
				gLinks.push({ source: link.source, target: link.target, edges: [ link ] });
			}
		});

		console.log(gLinks);
		//.filter((l) => l.classificationlevel1 !== 'marriage');

		console.log(linkTypes);
		console.log(familyNamesGroups);

		// drawing
		const height = 600;
		const width = 2000;
		const svg = d3
			.select('body')
			.append('svg')
			.attr('class', 'svg-wrapper')
			.attr('width', width)
			.attr('height', height);

		const simulation = d3force
			.forceSimulation(gNodes)
			.force(
				'link',
				d3
					.forceLink(gLinks)
					.strength((link) => link.edges.length / 4)
					.distance((link) => link.edges.length / 4)
					.iterations(1)
			)
			//.force('many', d3.forceManyBody().strength(10).distanceMax(10).distanceMin(5))
			.force('charge', d3.forceCollide().radius(80).strength(0.1))
			.force('center', d3.forceCenter(400, height / 2))
			.force('x', d3.forceX(width / 2))
			.force('y', d3.forceY(height / 2).strength(1))
			.stop()
			.tick(100);

		const typesToDisplay = [
			'instruction in heretical beliefs',
			'public reading',
			'accommodation',
			'reading',
			'servant'
		];

		const edgesGsHalo = svg
			.append('g')
			.selectAll('line')
			.data(gLinks.filter((l) => l.edges.find((e) => typesToDisplay.includes(e.classificationlevel1))))
			.enter()
			.append('line')
			.attr('class', 'edge-halo')
			.attr('stroke-width', (d) => d.edges.length + 5)
			.attr('stroke', (d) => {
				let color = 'white';
				let index = 5;
				d.edges.forEach((e) => {
					if (typesToDisplay.includes(e.classificationlevel1)) {
						const i = typesToDisplay.indexOf(e.classificationlevel1);
						if (i < index) {
							color = typeColors[i];
							index = i;
						}
					}
				});
				return color;
			})
			.attr('x1', (d) => d.source.x)
			.attr('x2', (d) => d.target.x)
			.attr('y1', (d) => d.source.y)
			.attr('y2', (d) => d.target.y);

		const edgesGs = svg
			.append('g')
			.selectAll('line')
			.data(gLinks)
			.enter()
			.append('line')
			.attr('class', (d) => 'edge')
			.attr('stroke-width', (d) => d.edges.length)
			.attr('x1', (d) => d.source.x)
			.attr('x2', (d) => d.target.x)
			.attr('y1', (d) => d.source.y)
			.attr('y2', (d) => d.target.y);

		const radius = (val) => 10 + Math.pow(val, 0.8);

		const nodesGs = svg
			.append('g')
			.selectAll('circle')
			.data(gNodes)
			.enter()
			.append('circle')
			.attr('fill', (d) => {
				const familyI = familyNamesGroups.indexOf(d.familyname);
				return familyI > -1 ? familyColors[familyI] : familyColors[5];
			})
			.attr('class', (d) => {
				const classes = [ 'node' ];
				d.sex === 'f' ? classes.push('node-female') : classes.push('node-male');
				d.deponent === '1' ? classes.push('node-deponent') : false;
				return classes.join(' ');
			})
			.attr('data-label', (d) => d.name)
			.attr('r', (d) => radius(d.degree))
			.attr('cx', (d) => d.x)
			.attr('cy', (d) => d.y);

		const labelsGs = svg
			.append('g')
			.selectAll('text')
			.data(gNodes)
			.enter()
			.append('text')
			.text((d, di) => di + 1)
			.attr('class', 'node-label')
			.attr('data-label', (d) => d.name)
			.attr('x', (d) => d.x)
			.attr('y', (d) => d.y + 2);

		// labels legend
		const lNamesXs = [ 1100, 1300 ];
		gNodes.forEach((node, ni) => {
			const y = 50 + height / gNodes.length * Math.floor(ni / 2);
			const x = (ni + 1) % 2 ? lNamesXs[0] : lNamesXs[1];
			svg
				.append('text')
				.attr('class', 'legend-name-label')
				.text(ni + 1 + ' - ' + node.label)
				.attr('x', x)
				.attr('y', y);
		});

		// edge type legend
		const ltypesX = 800;
		const lineH = 30;
		const rectW = 40;
		const rectH = lineH - 10;
		const typeYStart = 50;
		typesToDisplay.forEach((type, ti) => {
			const y = typeYStart + lineH * ti;
			svg
				.append('rect')
				.attr('x', ltypesX)
				.attr('y', y)
				.attr('width', rectW)
				.attr('height', rectH)
				.attr('fill', typeColors[ti])
				.attr('class', 'legend-type-rect');
			svg
				.append('text')
				.attr('x', ltypesX + rectW + 5)
				.attr('y', y + rectH / 2)
				.text(type)
				.attr('class', 'legend-type-label');
		});
	});
});
