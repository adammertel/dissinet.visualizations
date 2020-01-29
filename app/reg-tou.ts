import * as d3 from 'd3';
import * as d3tile from 'd3-tile';

async function loadPlaces() {
	return await d3.csv(require('./data/regtou/places.csv'));
}
async function loadNames() {
	return await d3.csv(require('./data/regtou/names.csv'));
}
async function loadEdges() {
	return await d3.csv(require('./data/regtou/edges.csv'));
}

loadNames().then((persons) => {
	loadPlaces().then((places) => {
		loadEdges().then((edges) => {
			console.log('persons', persons);
			console.log('edges', edges);
			console.log('places', places);

			/*
				getting edges for persons
			*/

			persons.forEach((p) => (p.edges = []));

			edges.forEach((edge) => {
				const targetPerson = persons.find((p) => p.ID === edge.Target);
				const sourcePerson = persons.find((p) => p.ID === edge.Source);

				if (targetPerson && sourcePerson) {
					sourcePerson.edges.push({
						to: targetPerson,
						type: 'source'
					});

					targetPerson.edges.push({
						to: sourcePerson,
						type: 'target'
					});
				}
			});

			/*
			 geocode persons
			*/
			const personWithPlace = persons.filter((person: any) => {
				// assigning place name to person
				const both = person.Origin_or_residence;
				const origin = person.Origin;
				const residence = person.Residence;

				let personPlace = '';
				if (both) {
					if (both.includes('/')) {
						personPlace = both.split('/')[0];
					} else {
						personPlace = both;
					}
				} else if (residence) {
					personPlace = residence;
				} else if (origin) {
					personPlace = origin;
				}

				if (personPlace.indexOf(' region') > -1) {
					personPlace = personPlace.split(' ')[0];
				}

				const place = places.find((place: any) => place.Place === personPlace);

				// logging places that are not geocoded
				if (!place && personPlace) {
					//console.log(personPlace);
				}

				if (place) {
					person.place = {
						name: place.Place,
						x: parseFloat(place.x_kontrola),
						y: parseFloat(place.y_kontrola)
					};
				}

				return place;
			});

			/*
			group persons based on their locality
			*/
			const placeGroups: any = [];
			personWithPlace.forEach((person: any) => {
				// only known locations
				if (person.place.x && person.place.y) {
					if (person.place.name in placeGroups) {
						placeGroups[person.place.name].persons.push(person);
					} else {
						placeGroups[person.place.name] = {
							x: parseFloat(person.place.x),
							y: parseFloat(person.place.y),
							persons: [ person ]
						};
					}
				}
			});

			/* 
				summing edges for groups
			*/
			Object.keys(placeGroups).forEach((groupKey) => {
				const group = placeGroups[groupKey];
				group.edges = {};
				group.persons.forEach((person) => {
					person.edges.filter((e) => e.to.place).forEach((personEdge) => {
						const targetPlace = personEdge.to.place.name;
						if (targetPlace in group.edges) {
							group.edges[targetPlace].push(personEdge.to.ID);
						} else {
							group.edges[targetPlace] = [ personEdge.to.ID ];
						}
					});
				});
			});

			/*
				occupancyGroups
			*/
			const occupancyGroups = {};
			persons
				.filter((p) => p.Network === 'd' || p.Network === '')
				.filter((p) => p.Occupation_type)
				.forEach((person) => {
					const edges = person.edges;
					const occupationPerson = person.Occupation_type;
					const occupanciesList = edges.map((edge) => edge.to.Occupation_type).filter((o) => o);

					// creating occupancies dictionary
					const occupancies = {};
					occupanciesList.forEach((occ) => {
						if (occ in occupancies) {
							occupancies[occ] += 1;
						} else {
							occupancies[occ] = 1;
						}
					});

					if (occupationPerson in occupancyGroups) {
						occupancyGroups[occupationPerson].people.push(person);
						Object.keys(occupancies).forEach((occ) => {
							const val = occupancies[occ];
							if (occ in occupancyGroups[occupationPerson].edges) {
								occupancyGroups[occupationPerson].edges[occ] += val;
							} else {
								occupancyGroups[occupationPerson].edges[occ] = 1;
							}
						});
					} else {
						occupancyGroups[occupationPerson] = { people: [ person ], edges: occupancies };
					}

					Object.keys(occupancies).forEach((occ) => {
						const val = occupancies[occ];
						if (occ in occupancyGroups) {
							if (occupationPerson in occupancyGroups[occ].edges) {
								occupancyGroups[occ].edges[occupationPerson] += val;
							} else {
								occupancyGroups[occ].edges[occupationPerson] = 1;
							}
						} else {
							const edges = {};
							edges[occupationPerson] = 1;
							occupancyGroups[occ] = { people: [], edges };
						}
					});
				});

			console.log(occupancyGroups);

			/* 
				drawing map
			*/
			const width = 1500;
			const height = 800;

			const tileSize = 256;
			var projection = d3.geoMercator().scale(18000).center([ 1.8, 43.74 ]);

			const svg = d3.select('body').append('svg').attr('width', width).attr('height', height);
			var path = d3.geoPath().projection(projection);

			const url = (x, y, z) => `https://stamen-tiles-a.a.ssl.fastly.net/terrain-background/${z}/${x}/${y}.png`;
			const tiler = d3tile
				.tile()
				.size([ width, height ])
				.scale(projection.scale() * 2 * Math.PI)
				.tileSize(tileSize)
				.translate(projection([ 0, 0 ]));

			const tiles = tiler();
			const [ tx, ty ] = tiles.translate;
			const k = tiles.scale;

			/* 
				setting tiles
			*/
			tiles.map(([ x, y, z ]) => {
				svg
					.append('image')
					.datum(function(d) {
						return d;
					})
					.attr('xlink:href', function(d) {
						return url(x, y, z);
					})
					.attr('x', (x + tx) * k)
					.attr('y', (y + ty) * k)
					.attr('width', k + 0.2)
					.attr('height', k + 0.2)
					.style('opacity', 0.7)
					.style('mix-blend-mode', 'normal');
			});

			const gEdges = svg.append('g').attr('class', 'edges');
			const gCircles = svg.append('g').attr('class', 'circles');
			const gLabels = svg.append('g').attr('class', 'labels');

			const groupsBySize = Object.keys(placeGroups)
				.map((groupKey) => {
					placeGroups[groupKey].name = groupKey;
					return placeGroups[groupKey];
				})
				.sort((a, b) => (a.persons.length > b.persons.length ? 1 : -1));

			groupsBySize.forEach((group) => {
				const [ x, y ] = projection([ group.x, group.y ]);

				const liner = d3.line().curve(d3.curveBasis).x((d) => d[0]).y((d) => d[1]);

				if (x > 0 && x < width && y > 0 && y < height) {
					const circleSize = 1 + group.persons.length * 1.4;
					gCircles
						.append('circle')
						.style('fill', '#0000dc')
						.style('opacity', 1)
						.attr('r', circleSize)
						.attr('stroke-width', 2)
						.attr('stroke', 'black')
						.attr('cx', x)
						.attr('cy', y);

					Object.keys(group.edges).forEach((edgeKey) => {
						const edge = group.edges[edgeKey];
						const target = placeGroups[edgeKey];
						if (target) {
							const targetX = target.x;
							const targetY = target.y;
							if (targetX !== group.x) {
								const [ ex, ey ] = projection([ targetX, targetY ]);
								if (ex > 0 && ex < width && ey > 0 && ey < height) {
									const d = liner([ [ x, y ], [ ex, ey + 20 ] ]);

									const edgeW = edge.length - 0.5;
									if (edgeW) {
										gEdges
											.append('path')
											.attr('stroke-width', edgeW)
											.attr('fill', 'none')
											.attr('stroke', 'black')
											.attr('stroke-linecap', 'round')
											.attr('d', function(d) {
												const dx = x - ex;
												const dy = y - y;
												const dr = Math.sqrt(dx * dx + dy * dy);
												return (
													'M' + x + ',' + y + 'A' + dr + ',' + dr + ' 0 0,1 ' + ex + ',' + ey
												);
											});
									}
								}
							}
						}
					});

					let edgesSum = 0;
					Object.keys(group.edges).forEach((e) => {
						if (e !== group.name) {
							edgesSum = edgesSum + parseInt(group.edges[e].length);
						}
					});
					if (group.persons.length > 4 || edgesSum > 1) {
						const textSize = 8 + group.persons.length * 1.5;
						const leftLabels = [
							'Toulouse',
							'Bouillac',
							'Tarabel',
							'Ferrus',
							'Varennes',
							'Mirepoix-sur-Tarn',
							'Beauvais-sur-Tescou'
						];
						const topLabels = [
							'Mirepoix-sur-Tarn',
							'Saint-Sulpice-la-Pointe',
							'Azas',
							'Verdun-Lauragais',
							'Beauvais-sur-Tescou'
						];
						const label = group.name;
						const left = leftLabels.includes(label);
						const top = topLabels.includes(label);
						gLabels
							.append('text')
							.style('font-size', textSize)
							.text(label)
							.attr('color', 'black')
							.attr('text-anchor', left ? 'end' : 'start')
							.attr('alignment-baseline', top ? 'middle' : 'middle')
							.attr('font-weight', 1000)
							.attr('stroke-width', textSize / 12)
							.attr('stroke', 'white')
							.attr('font-family', 'ubuntu')
							.attr('x', left ? x - textSize : x + textSize)
							.attr('y', top ? y - textSize : y + textSize);
					}
				}
			});

			const gChord = svg.append('g').attr('class', 'chord');
		});
	});
});
