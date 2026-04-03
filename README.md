# Cloudmark Blog

Personal blog by Mark Galea — [cloudmark.github.io](https://cloudmark.github.io)

Built with [Jekyll](https://jekyllrb.com/) and hosted on [GitHub Pages](https://pages.github.com/).

## Prerequisites

- **Ruby 3.0+** with dev headers
- **Bundler 2.5+**
- **GCC / build tools** (for native gem extensions)

### macOS

```bash
# Install Xcode Command Line Tools (provides build tools)
xcode-select --install

# Install Ruby via rbenv (recommended over system Ruby)
brew install rbenv ruby-build
rbenv install 3.2.4
rbenv global 3.2.4    # or: rbenv local 3.2.4 (project-only)

# Verify
ruby --version   # should show 3.2.x

# Install Bundler
gem install bundler
```

### Ubuntu / Debian

```bash
sudo apt-get install ruby ruby-dev build-essential zlib1g-dev
gem install bundler
```

## Getting Started

```bash
git clone https://github.com/cloudmark/cloudmark.github.io.git
cd cloudmark.github.io
bundle install
```

## Running Locally

Start the development server with live reload:

```bash
bundle exec jekyll serve --livereload
```

Then open [http://localhost:4000](http://localhost:4000) in your browser.

To include draft posts:

```bash
bundle exec jekyll serve --livereload --drafts
```

## Writing a New Post

Create a Markdown file in `_posts/` following this naming convention:

```
YYYY-MM-DD-Title-Of-Post.md
```

Each post needs front matter at the top:

```yaml
---
layout: post
title: Your Post Title
---
```

You can work on drafts by placing files in `_drafts/` (no date prefix needed) and running with `--drafts`.

## Building for Production

```bash
bundle exec jekyll build
```

The static site is output to `_site/`.

## Deployment

Pushing to the `master` branch automatically triggers a GitHub Pages build and deploy. No additional steps needed.

## Troubleshooting

**`mkmf.rb can't find header files for ruby`**
You're missing the Ruby development headers. On Ubuntu/Debian, install `ruby-dev`. On macOS with rbenv, headers are included automatically.

**`Bundler version mismatch` warning**
Run `gem install bundler` to update Bundler to the version specified in the lockfile.

**`Operation not permitted` on `_site/`**
Delete the `_site/` folder and rebuild: `rm -rf _site && bundle exec jekyll build`

## Project Structure

```
_posts/       Blog post Markdown files
_drafts/      Draft posts (not published)
_layouts/     HTML layout templates
_includes/    Reusable HTML partials
_sass/        Sass stylesheets
_site/        Generated static site (gitignored)
_config.yml   Jekyll configuration
images/       Post images and assets
```
