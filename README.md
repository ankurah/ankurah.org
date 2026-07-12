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

The complete local preview uses:

- [Bun](https://bun.sh/) for the fallback static server
- [mdBook](https://rust-lang.github.io/mdBook/) and `mdbook-mermaid`
- [liaison](https://github.com/dnorman/liaison) for keeping embedded examples in sync

Install the Rust-based tools with:

```bash
cargo install mdbook --version 0.5.3 --locked
cargo install mdbook-mermaid --version 0.17.0 --locked
```

### Local Development

Use `dev.sh` as the authoritative local workflow:

```bash
./dev.sh
```

It transcludes the example code, builds mdBook, overlays the custom landing page
and assets into `book/`, and starts a local server. It prints the selected URL
when ready and watches the source, landing-page, and example directories when a
supported file watcher is available.

### Building

For a one-off complete build without starting the development server, run:

```bash
find "$PWD/src" -type f -name '*.md' -print0 | xargs -0 liaison "$PWD/index.html"
mdbook build
cp index.html styles.css book/
cp -R images book/
python3 scripts/check-links.py
```

The complete static site will be in `book/`. Running `mdbook build` by itself
only builds the documentation surface; it does not install the custom landing
page at `book/index.html`.

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
- `src/getting-started/` - Template quick start and manual setup
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
   python3 scripts/check-links.py
   ./dev.sh
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
4. Test locally with `python3 scripts/check-links.py` and `./dev.sh`
5. Submit a pull request

## License

The Ankurah project is dual-licensed under MIT or Apache-2.0.

The documentation content in this repository is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Links

- [Ankurah Main Repository](https://github.com/ankurah/ankurah)
- [Discord Community](https://discord.gg/XMUUxsbT5S)
- [Live Website](https://ankurah.org)
