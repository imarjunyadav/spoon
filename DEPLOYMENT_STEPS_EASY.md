# ☁️ Super Simple Deployment Guide (Beginner Version)

This guide assumes you know nothing about cloud. Just follow these steps one by one.

---

## 🛑 Step 0: Initial Setup (Do this once)

### 1. Install "GCloud CLI"
This is the tool that lets your computer talk to Google's computers.
1.  **[Click to Download (Windows)](https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe)**.
2.  Run the installer.
3.  Keep clicking "Next" / "I Agree".
4.  **Important**: At the very end, make sure "Start Google Cloud SDK Shell" is CHECKED, then click Finish.
5.  A black window will open. Type `gcloud init` and hit Enter.
6.  It will open a browser. Login with your Google account.
7.  Close the window when done.

### 2. Restart VS Code
Close your code editor and open it again. This makes sure it sees the new tool.

---

## 🔑 Step 1: Gather Your "Secrets"
Google needs 5 passwords to run your app. Copy them to a simpler place (like Notepad) first.

1.  **Project ID**:
    - Go to [Google Cloud Home](https://console.cloud.google.com/home/dashboard).
    - Look at the top left card "Project Info".
    - Copy the **ID** (e.g., `spoon-project-123`).

2.  **Supabase URL & Key**:
    - Go to Supabase -> Settings -> API.
    - Copy **Project URL**.
    - Copy **service_role** key (starts with `ey...`).

3.  **Razorpay Keys**:
    - You surely have these from your `.env` file!
    - `RAZORPAY_KEY_ID` (starts with `rzp_test_...`).
    - `RAZORPAY_WEBHOOK_SECRET` (the secret code you made up).

---

## 🚀 Step 2: Push the Button
Now we run the script I made for you.

1.  Open Terminal in VS Code (`Ctrl` + `~`).
2.  Type this EXACT command and press `Enter`:
    ```powershell
    ./deploy.ps1
    ```

---

## 📝 Step 3: Answer the Questions
The script will ask you for the things you copied in Step 1.

1.  **"Enter Project ID"**: Paste the ID from Google.
2.  **"Supabase URL"**: Paste it.
3.  **"Supabase Key"**: Paste it.
... and so on.

**Note**: To paste in terminal, usually **Right Click** works best.

---

## 🎉 Step 4: You are Live!
The script will think for about 2 minutes.
When it finishes, it will show green text: `Deployment Complete!`
It will give you a link: `https://spoon-backend-....run.app`

**Click that link.** That is your new website address!
