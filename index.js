require('dotenv').config()
const { App } = require('@slack/bolt');
const Queue = require('bee-queue');
const urlRegex = require('url-regex');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const nodeshout = require('nodeshout-koffi');
const crypto = require("node:crypto");
const ytdl = require("@distube/ytdl-core");
const { execSync } = require("node:child_process")
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true
});
nodeshout.init();
console.log('Libshout version: ' + nodeshout.getVersion());
var queue = new Queue('SONGS', {
    redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379
    },
    removeOnSuccess: true,
    removeOnFailure: true,
    storeJobs: false
})
const shout = nodeshout.create();
shout.setHost(process.env.ICECAST_HOST || "localhost");
shout.setPort(process.env.ICECAST_PORT ? parseInt(process.env.ICECAST_PORT) : 8000);
shout.setUser("source");
shout.setPassword("hackme");
shout.setMount("/stream.mp3");
shout.setFormat(1);
shout.setAudioInfo('bitrate', '192');
shout.setAudioInfo('samplerate', '44100');
shout.setAudioInfo('channels', '2');
shout.open();
global.stopped = false
global.isPlaying = false;
global.marker = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

queue.process(async function (job, done) {
    global.stopped = false;
    if (!global.marker) {
        console.info("Stopped ghost at processing stage")
        return done(null, true)
    }
    console.log("processing")
    try {
        await app.client.chat.postMessage({
            channel: job.data.channelId,
            text: `💿 Now playing *${job.data.title}* by *${job.data.author}*. ${job.data.background ? "It will play around 40db." : ""}`
        })
        if (job.data.channelId) {
            await (await fetch(`http://localhost:${process.env.BROWSER_PORT || 3000}/move?` + new URLSearchParams({
                url: job.data.huddle,
                id: job.data.channelId
            }).toString())).json();
        }
        await play(job.data.file);

        return done(null, true);
    } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        return done(null, true);
    }
});
app.command('/skip', async ({ ack, command, respond, say, body }) => {
    await ack();
    global.stopped = true;
    await respond(":spin-loading: Skipping, hold on.")
})
app.command('/stop', async ({ ack, command, respond, say, body }) => {
    await ack();
    try {
        await app.client.conversations.join({
            channel: body.channel_id
        })
    } catch (e) {

    }
    try {
        await app.client.conversations.invite({
            channel: body.channel_id,
            users: process.env.SLACK_USER_ID
        })
    } catch (e) {

    }
    await (await fetch(`http://localhost:${process.env.BROWSER_PORT || 3000}/leave`)).json();
    queue.destroy(function (err) {
        queue = new Queue('SONGS', {
            redis: {
                host: process.env.REDIS_HOST || "localhost",
                port: process.env.REDIS_PORT || 6379
            },
            removeOnSuccess: true,
            removeOnFailure: true,
            storeJobs: false
        })
    });
    global.stopped = true;
    await respond("✅ Stopped. Stopping can take up to 5 seconds.")
});

app.command('/queue', async ({ ack, command, respond, say, body }) => {
    try {
        await app.client.conversations.join({
            channel: body.channel_id
        })
    } catch (e) {

    }
    queue.getJobs('waiting').then(async (jobs) => {
        const q = jobs.map((job, i) => `*#${i + 1}*: *${job.data.title}* by ${job.data.title} (<#${job.data.channelId}>). ${job.data.background ? "It will play around 40db." : ""}`).reverse()
        if (q.length == 0) return await respond(":x: There's nothing in the queue.")
        await respond(q.join("\n"))
    });
    await ack();
})
app.command('/play', async ({ ack, command, respond, say, body }) => {
    await ack();
    try {
        await app.client.conversations.join({
            channel: body.channel_id
        })
    } catch (e) {

    }
    try {
        await app.client.conversations.invite({
            channel: body.channel_id,
            users: process.env.SLACK_USER_ID
        })
    } catch (e) {

    }
    global.marker = true
    try {
        await app.client.conversations.join({
            channel: body.channel_id
        })
    } catch (e) {

    }
    await respond(":spin-loading: Fetching information.")
    var url = command.text.match(urlRegex());
    if (!url) return await respond(":x: No URLs provided");
    url = url[0];
    var metadata = null;
    const id = crypto.randomBytes(16).toString("hex");
    try {
        metadata = await ytdl.getBasicInfo(url);

    } catch (e) {
        console.error(e);
        return await respond(":x: Failed to lookup video");
    }
    const writeStream = fs.createWriteStream(`/tmp/${id}`);
    console.log("downloading video");
    const downloadStream = ytdl(url, { filter: format => format.hasAudio });
    downloadStream.pipe(writeStream);
    writeStream.on('finish', async () => {
        console.log("converting");
        try {
            execSync(`ffmpeg -i /tmp/${id} -b:a 192k -ac 2 -ar 44100 /tmp/${id}.mp3`, { stdio: "pipe" });
            const job = queue.createJob({
                huddle: `https://app.slack.com/client/${body.team_id}/${body.channel_id}?open=start_huddle`, file: `/tmp/${id}.mp3`,
                channelId: body.channel_id,
                title: metadata.videoDetails.title,
                author: metadata.videoDetails.author.name,
                background: false
            });
            job
                .retries(0)
                .save();
            await app.client.chat.postMessage({
                channel: body.channel_id,
                text: `💿 <@${body.user_id}> added *${metadata.videoDetails.title}* by *${metadata.videoDetails.author.name}* to the queue!`
            })
        } catch (error) {
            console.error("Error during conversion:", error);
            respond(":x: Failed to convert video");
        }
    });
});
app.command('/bplay', async ({ ack, command, respond, say, body }) => {
    await ack();
    global.marker = true;
    try {
        await app.client.conversations.join({
            channel: body.channel_id
        })
    } catch (e) {

    }
    try {
        await app.client.conversations.invite({
            channel: body.channel_id,
            users: process.env.SLACK_USER_ID
        })
    } catch (e) {

    }
    await respond(":spin-loading: Fetching information.")
    var url = command.text.match(urlRegex());
    if (!url) return await respond(":x: No URLs provided");
    url = url[0];
    var metadata = null;
    const id = crypto.randomBytes(16).toString("hex");
    try {
        metadata = await ytdl.getBasicInfo(url);

    } catch (e) {
        console.error(e);
        return await respond(":x: Failed to lookup video");
    }
    const writeStream = fs.createWriteStream(`/tmp/${id}`);
    console.log("downloading video");
    const downloadStream = ytdl(url, { filter: format => format.hasAudio });
    downloadStream.pipe(writeStream);
    writeStream.on('finish', async () => {
        console.log("converting");
        try {
            execSync(`ffmpeg -i /tmp/${id} -b:a 192k -ac 2 -ar 44100 -filter:a "loudnorm=I=-40:TP=-1.0:LRA=11" /tmp/${id}.mp3`, { stdio: "ignore" });
            const job = queue.createJob({
                huddle: `https://app.slack.com/client/${body.team_id}/${body.channel_id}?open=start_huddle`, file: `/tmp/${id}.mp3`,
                channelId: body.channel_id,
                title: metadata.videoDetails.title,
                author: metadata.videoDetails.author.name,
                background: true
            });
            job.save();
            await app.client.chat.postMessage({
                channel: body.channel_id,
                text: `💿🤫 <@${body.user_id}> added *${metadata.videoDetails.title}* by *${metadata.videoDetails.author.name}* to the queue!`
            })
        } catch (error) {
            console.error("Error during conversion:", error);
            respond(":x: Failed to convert video");
        }
    });
});
async function play(filePath) {
    global.isPlaying = true
    if (!global.marker) {
        console.warn("Marker disabled. Ghost job detected.")
        return
    }
    const fileHandle = await fsp.open(filePath);
    const stats = await fileHandle.stat();
    const fileSize = stats.size;
    const chunkSize = 65536;
    const buf = Buffer.alloc(chunkSize);
    let totalBytesRead = 0;
    while (totalBytesRead < fileSize) {
        const readLength = (totalBytesRead + chunkSize) <= fileSize ?
            chunkSize :
            fileSize - totalBytesRead;

        const { bytesRead } = await fileHandle.read(buf, 0, readLength, totalBytesRead);

        totalBytesRead = totalBytesRead + bytesRead;
        if (bytesRead === 0) {
            global.isPlaying = false;
            break;
        }
        if (global.stopped) {
            global.stopped = false;
            global.isPlaying = false;
            break;
        }
        shout.send(buf, bytesRead);


        const delay = shout.delay();
        await sleep(delay);
    }

    console.log("finished. closing fh")

    await fileHandle.close();

}


(async () => {

    await app.start();

    console.log('Orpheaux (bolt) is running');
    console.warn("⚠️ Wait for the browser to start before running any commands!")
    await queue.destroy()
    queue = new Queue('SONGS', {
        redis: {
            host: process.env.REDIS_HOST || "localhost",
            port: process.env.REDIS_PORT || 6379
        },
        removeOnSuccess: true,
        removeOnFailure: true,
        storeJobs: false
    })
})();