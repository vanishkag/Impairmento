# SignAgent: Demo Guide for Judges

SignAgent lets Deaf, hard-of-hearing and speech-impaired people use agentic AI by signing instead of speaking. You sign a request to your webcam, and SignAgent carries it out in Google Calendar, Gmail, Tasks and Docs, asking for your approval before anything is sent or created.

**Live app:** https://gen-lang-client-0309758913.web.app

---

## Before you start

- Use **Chrome or Edge** on a laptop or desktop with a **webcam**.
- Allow **camera access** when the browser asks.
- Good lighting and a plain background help the hand tracker.

## Sign in

You can sign in with your own Google account, or a dummy account, and follow the below steps.



1. Open the app and click **Sign in with Google** at the top right.
2. In the Google pop-up, enter the demo email and password, or choose your own account.
3. If you see **"Google hasn't verified this app"**, click **Advanced**, then **Continue**. This is expected for a prototype.
4. On the permissions screen, tick every box and click **Continue**. SignAgent needs these to create calendar events, send email, add tasks and write docs on your behalf.
5. Your email address appears at the top of the page. You are signed in.

> Not signed in? The app still works in demo mode, but actions are simulated and labelled as such.

## Try it

### Sign a request
1. Click the **camera** icon next to the text box.
2. Raise your hands into view. Recording starts automatically and a red **Recording** badge appears.
3. Sign your request, for example: *meeting with John, today, 5 pm*.
4. Lower your hands. After about 1.5 seconds the clip is sent.
5. A **Confirm before I do this** card shows exactly what SignAgent will do. Click **Confirm**.
6. Open Google Calendar for the same account to see the event.

### Or type a request
Type into the box, or tap one of the suggestions:

- `Add in my calendar a trip to Goa on coming Sunday`
- `Email me a packing list for Goa`
- `Add task: renew passport`
- `Directions to Bangalore airport`

Emails and calendar events always wait for your confirmation. Tasks, docs and directions run straight away.

### Use work context (optional)
1. Click **+ Context** and paste something you are working on, such as a ticket title or meeting notes.
2. Sign or type a request that refers to it, such as *send this to Rohan*.
3. If an email address is missing, SignAgent asks for it instead of guessing.

## Links

- **Demo video:** https://drive.google.com/file/d/1Vqk5ZG9S5Ld3Cy6Wj_G_iEopl9nOMQLD/view?usp=drive_link
- **Source code:** https://github.com/vanishkag/Impairmento

Team NAVigators · Google Cloud AI Builder Cup 2026 · Category: Accessibility
