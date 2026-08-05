# SQL Assistant Easter Egg

The extra AI Query Finder was removed from the **Approved Queries** page. The Easter egg now uses the existing search field on the **SQL Assistant** page.

## Choose the secret word

Open `js/app.js` and find:

```js
const QUERY_EASTER_EGG = 'change-this-secret-word';
```

Replace the text between the quotes with your secret word or phrase. Matching is case-insensitive and ignores spaces at the beginning or end.

## How it works

When a user types the exact secret into SQL Assistant and submits the form, the app routes to:

```text
#/rickroll
```

Normal SQL Assistant requests continue through the existing assistant flow.

## Run locally

This version is static again, so you can use:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Branding included

This package includes the updated QT logo and browser-tab icons in `assets/`.
The header and login page use `assets/QT_logo.png`, and `index.html` references the favicon files.
