# Netlify Setup Guide for WhatsApp Academic Manager Frontend

## ✅ Configuration Complete

The `netlify.toml` file has been added to configure proper deployment.

## 🔧 Next Steps in Netlify Dashboard

After this push triggers a deployment, you need to configure environment variables in Netlify:

### Required Environment Variables

Go to: **Site settings → Environment variables → Add a variable**

Add these variables:

1. **NEXT_PUBLIC_API_URL**
   - Value: `https://whatsapp-academic-manager-production.up.railway.app`
   - Description: WhatsApp service Railway URL

2. **NEXT_PUBLIC_BACKEND_URL**
   - Value: `https://wam-api-production.up.railway.app`
   - Description: Backend Python API URL

3. **NEXT_PUBLIC_API_KEY** (Optional - for admin/public access)
   - Value: Your API key from Railway environment
   - Description: Public API key for admin flows

## 📁 Build Configuration

The netlify.toml is configured with:
- **Base directory**: `whatsapp-service/frontend`
- **Build command**: `npm run build`
- **Publish directory**: Automatically handled by `@netlify/plugin-nextjs`
- **Node version**: 22.x
- **Next.js Plugin**: Enabled for optimal deployment

**Note**: The publish directory is intentionally not set in the config. The Next.js plugin automatically determines the correct output directory and requires that publish ≠ base.

## 🔍 Verify Deployment

After deployment succeeds:

1. Check that the build log shows:
   - `Installing dependencies from package.json`
   - `npm install` running in `whatsapp-service/frontend`
   - `next build` completing successfully

2. Test the deployed site:
   - Visit your Netlify URL
   - Check that all pages load correctly
   - Verify API calls work (groups, messages, etc.)

## 🐛 Troubleshooting

### If build still fails:

1. **Check Node version**: Ensure Netlify is using Node 22.x
   - Site settings → Build & deploy → Environment → Node version

2. **Verify environment variables**: Make sure all required env vars are set
   - Site settings → Environment variables

3. **Check build logs**: Look for specific error messages
   - Deploys → [Latest deploy] → Deploy log

4. **Clear cache and redeploy**:
   - Deploys → Trigger deploy → Clear cache and deploy site

### Common Issues:

- **Module not found**: Missing environment variables
- **Build timeout**: Increase build time in site settings
- **404 on routes**: Next.js plugin should handle this automatically

## 📚 Resources

- [Netlify Next.js Documentation](https://docs.netlify.com/frameworks/next-js/overview/)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Netlify Build Configuration](https://docs.netlify.com/configure-builds/file-based-configuration/)
