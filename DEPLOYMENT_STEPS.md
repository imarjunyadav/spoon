# 🚀 Simple 3-Step Deployment Guide

Follow these exact steps to deploy your app for free.

## ✅ Step 1: Get Your Secrets
You need these 5 values ready. Copy them to a notepad.

1.  **Project ID**: Found on your [Google Cloud Dashboard](https://console.cloud.google.com/home/dashboard).
    - *Example:* `spoon-project-12345`
2.  **Supabase URL**: Found in Supabase Settings -> API.
3.  **Supabase Key**: Found in Supabase Settings -> API (`service_role` key).
4.  **Razorpay Key ID**: Your Test Key ID (`rzp_test_...`).
5.  **Razorpay Secret**: Your Test Key Secret.

*(Redis URL is optional if you don't have one yet - the app works without it)*

---

## ✅ Step 2: Open Terminal & Run Script
**Prerequisite:** Ensure [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) is installed.

1.  Open VS Code Terminal (`Ctrl + ~`).
2.  Type this command and hit Enter:
    ```powershell
    ./deploy.ps1
    ```

---

## ✅ Step 3: Follow the Prompts
The script will ask you questions. Here is how to answer:

1.  **"Enter your Google Cloud Project ID"**
    - Paste your Project ID from Step 1.
2.  **"Supabase URL"**
    - Paste your URL.
3.  **"Supabase Service Role Key"**
    - Paste your Key.
4.  **"Razorpay Key ID"**
    - Paste your Key.
(Hit Enter to skip any optional ones)

---

## 🎉 That's it!
The script will do the rest:
- It logs you in.
- It enables necessary Google services.
- It deploys your code.
- It gives you a **final URL** (e.g., `https://spoon-backend-xyz.a.run.app`).

**Click that URL** and you will see your app live!
