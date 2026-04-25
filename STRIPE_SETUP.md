# Stripe Setup for HomeWOD

## Step 1: Create Stripe Account
- Go to stripe.com → sign up
- Stay in TEST MODE (toggle in top left dashboard)

## Step 2: Create Product
- Dashboard → Products → Add Product
- Name: HomeWOD Pro
- Description: Unlimited WODs, weekly programming, and more
- Pricing model: Recurring
- Price: $9.00 USD / month
- Save → copy Price ID (price_...)

## Step 3: Get API Keys
- Dashboard → Developers → API Keys
- Copy Publishable key (pk_test_...)
- Copy Secret key (sk_test_...)

## Step 4: Add to .env
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID=price_...
```

## Step 5: Add to Vercel Dashboard
- Vercel → Project → Settings → Environment Variables
- Add all 4 Stripe variables
- Redeploy after adding

## Step 6: Set Up Webhook
Note: Must be deployed first
- Stripe → Developers → Webhooks → Add Endpoint
- URL: https://homewod.fit/api/webhook
- Events to listen for:
  - checkout.session.completed
  - customer.subscription.deleted
  - customer.subscription.updated
- Copy Signing Secret (whsec_...)
- Add to Vercel env vars:
  ```
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```
- Redeploy

## Step 7: Test the Flow
Use Stripe test card:
- Number: 4242 4242 4242 4242
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

Expected flow:
1. Click "Upgrade to Pro — $9/month"
2. Stripe checkout page opens
3. Enter test card details
4. Redirected to homewod.fit/success
5. Animated checkmark plays
6. Pro badge appears on return
7. History cap increases to 50
8. Weekly program unlocked

## Step 8: Go Live (when ready)
- Complete Stripe account verification
- Switch to live API keys
- Update all STRIPE_ env vars
- Test with real card
- You're live!
