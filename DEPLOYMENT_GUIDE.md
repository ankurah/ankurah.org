# Deployment Guide for ankurah.org

Your Ankurah documentation website is ready! Here's how to deploy it to GitHub Pages.

## Repository Status

✅ Local git repository initialized
✅ Initial commit created
✅ All source files tracked
✅ Build tested successfully
✅ Landing page and mdBook documentation ready

## Next Steps

### 1. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `ankurah.org`
3. Description: "Documentation website for Ankurah"
4. Choose Public visibility
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

### 2. Push to GitHub

From the `ankurah.org` directory, run:

```bash
git remote add origin https://github.com/ankurah/ankurah.org.git
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under "Build and deployment":
   - Source: **GitHub Actions**

That's it! GitHub Actions will automatically:

- Build the mdBook documentation
- Copy the landing page and assets
- Deploy to GitHub Pages

The site will be available at `https://ankurah.github.io/ankurah.org/`

### 4. Configure Custom Domain (Optional)

To use `ankurah.org` instead of `ankurah.github.io/ankurah.org`:

1. In your domain registrar (where you bought ankurah.org):

   - Add a CNAME record: `www` → `ankurah.github.io`
   - Add A records for apex domain (@) pointing to GitHub's IPs:
     - 185.199.108.153
     - 185.199.109.153
     - 185.199.110.153
     - 185.199.111.153

2. In GitHub repository settings → Pages:

   - Enter `ankurah.org` in the "Custom domain" field
   - Click "Save"
   - Enable "Enforce HTTPS" (once DNS propagates)

3. Add a `CNAME` file to the repository:
   ```bash
   echo "ankurah.org" > CNAME
   git add CNAME
   git commit -m "Add custom domain"
   git push
   ```

### 5. Verify Deployment

1. Check the Actions tab in your GitHub repository
2. Wait for the workflow to complete (usually 1-2 minutes)
3. Visit your site!

## Local Development

To work on the site locally:

```bash
# Serve with live reload
mdbook serve

# Build the site
mdbook build

# Copy landing page assets
cp index.html book/
cp styles.css book/
cp -r images book/
```

Then open `http://localhost:3000` in your browser.

## File Structure

```
ankurah.org/
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions workflow
├── images/
│   └── logo-128.png        # Ankurah logo
├── src/                    # mdBook source files
│   ├── SUMMARY.md          # Navigation structure
│   ├── what-is-ankurah.md  # Overview page
│   ├── getting-started.md  # Getting started guide
│   ├── architecture.md     # Architecture with Miro diagram
│   ├── glossary.md         # Terminology
│   ├── design-goals.md     # Design philosophy
│   └── examples.md         # Code examples
├── index.html              # Custom landing page
├── styles.css              # Landing page CSS
├── book.toml               # mdBook configuration
├── README.md               # Development guide
└── .gitignore              # Ignore build artifacts
```

## Updating Content

### To update the landing page:

Edit `index.html` and `styles.css`, then commit and push.

### To update documentation:

Edit files in `src/`, then commit and push. The site rebuilds automatically.

### To add a new page:

1. Create `src/new-page.md`
2. Add to `src/SUMMARY.md`
3. Commit and push

## Troubleshooting

**Build fails?**

- Check the Actions tab for error messages
- Verify mdBook syntax: `mdbook test` locally

**Landing page not showing?**

- Ensure index.html is being copied in `.github/workflows/deploy.yml`
- Check that paths in index.html are correct (relative to book/ directory)

**Images not loading?**

- Images should be in the `images/` directory
- Reference as `../images/file.png` from markdown files

## Adding Template Preview Image

When you have the preview image for the react-sled-template:

1. Save it to `images/react-sled-template.png`
2. Update `src/getting-started.md` to include:
   ```markdown
   ![React + Sled Template Preview](../images/react-sled-template.png)
   ```
3. Commit and push

## Questions?

- Check the main [Ankurah repository](https://github.com/ankurah/ankurah)
- Join the [Discord](https://discord.gg/XMUUxsbT5S)
