# The Yatra: Seeking Culture dynamics game (Upadesha Sara, verse 1)

A pilgrimage game for breakout groups of 3 to 8 people, drawn in an Oregon Trail pixel-art style. Each group creates a room and everyone joins on their own device. Players take turns making decisions, and every route reaches the temple. Every route takes between 10 and 14 decisions.

## Try it right now (no setup)
Open `index.html` through any local server, for example by running `npx serve site` in the rasa-lila repo and visiting `/seekingculture/yatra/`. While `firebase-config.js` is empty, the site runs in **local test mode**: rooms sync between tabs of the same browser only. Create a room in one tab and join it from two more tabs.

## Setup: about 10 minutes, one time only

### 1. Create the Firebase database (free)
1. Go to https://console.firebase.google.com and click **Create a project**. Name it something like `seeking-culture-yatra`. You can turn Google Analytics off.
2. In the left menu, open **Build → Realtime Database** and click **Create Database**. Pick the location nearest you, then choose **Start in locked mode**.
3. Open the **Rules** tab, replace everything with the rules below, and click **Publish**:
   ```json
   {
     "rules": {
       "rooms": {
         "$code": {
           ".read": true,
           ".write": true,
           ".validate": "$code.length < 20"
         }
       }
     }
   }
   ```
4. Click the gear icon, then **Project settings → General**. Scroll to **Your apps**, click the **</>** (web) icon, register an app (any name, and leave hosting unchecked), and copy the values from the `firebaseConfig` it shows.
5. Paste those values into `firebase-config.js`. Make sure `databaseURL` is filled in. If it's missing, copy the URL shown at the top of the Realtime Database page (it looks like `https://your-project-default-rtdb.firebaseio.com`, or `https://your-project-default-rtdb.<region>.firebasedatabase.app` outside the US; copy it exactly).

### 2. Deploy to Vercel
This game lives at `site/seekingculture/yatra/` in the rasa-lila repo, served at rasa-lila.vercel.app/seekingculture/yatra/. Commit and push to `main` and Vercel redeploys on its own. The Seeking Culture page links here, and the repo's `vercel.json` adds the trailing slash so `/seekingculture/yatra` loads its files.

### 3. Dry run before class
Open the site on 2 or 3 phones or laptops, create a room on one, join from the others, and play through once.

## Running it in class
1. Put the link (rasa-lila.vercel.app/seekingculture/yatra/) in the Zoom chat before breakouts.
2. In each breakout, one person taps **Create room** and reads the code aloud. The others tap **Join room**.
3. The host taps **Start the journey**. Turns go in the order people joined.
4. Only the person whose turn it is can tap a choice. The group talks it over first.
5. If someone drops off, the host ticks **Choose for [name]** and chooses for them. If the host drops off, another player becomes host after about 10 seconds.
6. Refreshing the page puts you back in your room. If someone closes the tab, they can join again with the **same name** and get their old place back.
7. At the end, groups see their path efficiency, then **Reveal Bhagavan's view** (100%, with the verse), then **Review the journey**, which shows the review next to the discussion questions.

After class you can delete old rooms in the Firebase console under Realtime Database → Data, but it isn't required.

## Editing
| To change | Edit |
|---|---|
| Any story text, options, results, "Bhagavan's view" lines, discussion questions | `story.js` |
| Starting values, daily food use, or turning meters off entirely (`METERS_ENABLED = false`) | `meters.js` |
| Colors and fonts | `style.css` (the variables at the top) |
| Maximum number of decisions (14) | `MAX_DECISIONS` in `engine.js` |
| The pixel pictures | `pixel-scenes.js` (each scene in `story.js` names its picture with `art`) |

## Files
- `index.html`: the page
- `style.css`: the look
- `story.js`: all the words
- `meters.js`: Food, Health, Calm and Faith
- `pixel-scenes.js`: the pixel-art pictures, drawn in code
- `engine.js`: the game rules (turns, detours, recovery stops, efficiency %)
- `sync.js`: rooms, using Firebase or local test mode
- `app.js`: the screens
- `firebase-config.js`: your Firebase keys (a web API key is meant to be public, and the rules above control access)
