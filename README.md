# Ankurah.org Website

This repository contains the source code for the [Ankurah](https://ankurah.org) documentation website.

## Structure

- `index.html` - Custom landing page
- `styles.css` - Landing page styling
- `images/` - Logo and other assets
- `src/` - mdBook source files (markdown)
- `book/` - Generated output (not committed)
- `.github/workflows/` - GitHub Actions for deployment

## Development

### Prerequisites

Install mdBook:

```bash
cargo install mdbook
```

### Local Development

1. **Build and serve the book:**

   ```bash
   mdbook serve
   ```

   This will start a local server at `http://localhost:3000` with auto-reload on changes.

2. **View the landing page:**

   After building, the landing page will be at `book/index.html`. To test the full site locally:

   ```bash
   mdbook build
   # Then open book/index.html in your browser
   ```

### Building

Build the static site:

```bash
mdbook build
```

Output will be in the `book/` directory.

## Deployment

The site is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

The deployment workflow:
1. Builds the mdBook documentation
2. Copies the landing page and assets
3. Deploys to GitHub Pages

## Content Organization

### Landing Page
- `index.html` - Main landing page HTML
- `styles.css` - Custom CSS for landing page
- `images/logo-128.png` - Ankurah logo

### Documentation (mdBook)
- `src/SUMMARY.md` - Navigation structure
- `src/what-is-ankurah.md` - Overview and introduction
- `src/getting-started.md` - Setup and templates
- `src/architecture.md` - System architecture
- `src/glossary.md` - Terminology reference
- `src/design-goals.md` - Design philosophy
- `src/examples.md` - Code examples

## Adding Content

### Adding a New Page

1. Create a new markdown file in `src/`:
   ```bash
   touch src/new-page.md
   ```

2. Add it to `src/SUMMARY.md`:
   ```markdown
   [New Page Title](new-page.md)
   ```

3. Write your content using markdown

4. Build and test locally:
   ```bash
   mdbook serve
   ```

### Adding Images

1. Place images in `images/` directory
2. Reference them in markdown:
   ```markdown
   ![Alt text](../images/your-image.png)
   ```

## Configuration

Edit `book.toml` to change:
- Site title and description
- Theme settings
- GitHub repository links
- Search configuration
- Other mdBook options

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `mdbook serve`
5. Submit a pull request

## License

The Ankurah project is dual-licensed under MIT or Apache-2.0.

The documentation content in this repository is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Links

- [Ankurah Main Repository](https://github.com/ankurah/ankurah)
- [Discord Community](https://discord.gg/XMUUxsbT5S)
- [Live Website](https://ankurah.org)

