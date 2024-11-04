
(async () => {
  require('dotenv').config()
  const express = require('express')
  const app = express()
  const puppeteer = require("puppeteer").default
  const browser = await puppeteer.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--allow-file-access',
      '--no-sandbox'
    ],
    headless: true,
    ignoreDefaultArgs: ['--mute-audio']
  });
  var page = await browser.newPage();
  global.channelId = null;
  try {
    await page.goto(`https://${process.env.SLACK_ORG}.slack.com/sign_in_with_password`, { waitUntil: "networkidle2" });
    await page.type('#email', process.env.SLACK_EMAIL);
    await page.type('#password', process.env.SLACK_PASSWORD);
    await page.click("#signin_btn");
    await page.waitForNavigation({ waitUntil: 'load', timeout: 60000 });
  } catch (error) {
    console.error(error);
  }

  
  const inputsExist = await page.evaluate(() => {
    return new Promise(resolve => {
      let intervalCount = 0;
      const interval = setInterval(() => {
        const inputs = document.querySelectorAll('input[inputmode="numeric"]');
        if (inputs.length == 6) {
          clearInterval(interval);
          resolve(true);
        }
        intervalCount += 1;
        if (intervalCount >= 5) {
          clearInterval(interval);
          resolve(false);
        }
      }, 500);
    });
  });

  if (inputsExist) {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Please enter the 6-digit 2FA code: ', async (code) => {
      rl.close();

      const codeArray = code.split('');

      const inputs = await page.$$('input[inputmode="numeric"]');

      for (let i = 0; i < 6; i++) {
        await inputs[i].type(codeArray[i]);
      }

      await page.keyboard.press('Enter');
    });
  }

  await page.close()
  var page2 = await browser.newPage()
  app.get('/leave', async (req, res) => {
    try {
      await page2.waitForSelector("#huddle_mini_player_leave_button", { visible: true, timeout: 2000 })
    } catch (e) {
      console.log(e)
    }
    try {
      await page2.click(`#huddle_mini_player_leave_button`)
    } catch (e) {
      console.log(e)

    }
    res.json({ success: true })
  })
  app.get('/move', async (req, res) => {
    const { url, id } = req.query

    console.log(`Moving to ${id}`)
    global.channelId = id
    await page2.evaluateOnNewDocument(() => {
      localStorage.setItem("devicePrefs", '{"version":"0.1","deviceIdPriorities":{"camera":[],"microphone":["default","communications"],"output":["default","communications"]},"deviceIdPrioritiesExtended":{"camera":[],"microphone":[{"id":"default","groupId":"0dbdcdf52e74dfb1874bca3b4365abbaa4292641b97a22b90c814613919fd068","label":"Default","labelWithoutId":"Default"}],"output":[{"id":"default","groupId":"0dbdcdf52e74dfb1874bca3b4365abbaa4292641b97a22b90c814613919fd068","label":"Default","labelWithoutId":"Default"}]},"video":{"enableHD":false,"mirrorVideo":false},"audio":{"enableAGC":false,"enableNoiseSuppression":false}}')
      navigator.mediaDevices.getUserMedia = async function () {
        const audioCtx = new AudioContext();

        const audioElement = new Audio(`http://localhost:8000/stream.mp3`);
        audioElement.crossOrigin = 'anonymous';
        audioElement.loop = false;

        await audioElement.play().catch(error => {
          console.error('Error playing audio:', error);
        });

        const source = audioCtx.createMediaElementSource(audioElement);

        const destination = audioCtx.createMediaStreamDestination();
        source.connect(destination);

        return destination.stream;
      };
    });
    
    await page2.goto(url)
    await page2.waitForSelector(`[data-qa="huddle_from_link_speed_bump_modal_old_go"]`, { visible: true })
    await page2.click(`[data-qa="huddle_from_link_speed_bump_modal_old_go"]`)
    res.json({ success: true })
  })

  app.listen(process.env.BROWSER_PORT || 3000, () => {
    console.log(`Browser listening on port ${process.env.BROWSER_PORT || 3000}`)
  })

  process.on("SIGINT", async () => {
    try {
      await page2.click(`#huddle_mini_player_leave_button`)
    } catch (e) { }
    process.exit();
  });
})();