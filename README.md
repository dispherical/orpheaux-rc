# orpheaux-rc

A cross-platform Slack music huddle playing bot

## Install
1. Get the databases and Icecast server going using docker-compose up -d
2. Install libshout(-dev(el))
3. Install the packages needed (`yarn install`)
4. Create a new Slack account, fill in the details.
5. Adjust the icecast/redis ports as needed in index.js
6. `npm start`!

## Diffrences
|                    	| Orpheaux                                	| Orpheaux-ng                    	| Orpheaux-rc (this)                          	|
|--------------------	|--------------------------------------------	|--------------------------------	|---------------------------------------	|
| Docker Support     	| ❌                                          	| ✅                              	| ❌                                     	|
| Icecast            	| ✅                                          	| ❌                              	| ✅                                     	|
| Stream Method      	| nodeshout (node-ffi) + pulseaudio + pwlink 	| Rejoining with fake microphone 	| nodeshout-koffi, hijacks getUserMedia 	|
| Cross-platform     	| Fedora Desktop Only                        	| ✅                              	| ✅                                     	|
| 2FA Support        	| ❌                                          	| ❌                              	| ✅                                     	|
| YouTube Downloader 	| yt-dlp (external cli)                      	| yt-dlp (external cli)          	| youtube-dl (node.js library)          	|
| Queue Support      	| ❌                                          	| ✅ via queue library + redis    	| ✅ via bee-queue (redis)               	|
|                    	|                                            	|                                	|                                       	|

