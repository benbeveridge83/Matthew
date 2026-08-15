# Matthew Verse Mapper

A GitHub Pages-ready study tool for the user-supplied text of Matthew. Version 1.0.2 includes all 28 chapters, 1,067 supplied verse records, 1,710 selectable sentence blocks, named passage groups, expandable group text, and a click-to-classify category matrix.

## What it does

- Select one or many sentence blocks—even across verses or chapters.
- Save the selection as a named passage group with a compact reference such as `Matthew 1:1–3`.
- Open **Category Matrix** to see each passage group as a row.
- Expand a row to read every selected sentence.
- Create category columns and click cells to classify passage groups.
- Work immediately in local browser storage, or connect Supabase for secure per-user persistence.

## Supabase setup

1. Create or open a Supabase project.
2. In **Authentication → Providers**, enable **Anonymous Sign-Ins**. Supabase anonymous users are authenticated users, but they remain tied to that browser unless later upgraded to a permanent identity.
3. Open the SQL Editor and run all of `supabase-schema.sql`.
4. In **Project Settings → API**, copy the Project URL and the **publishable** key.
5. Either paste those values into `config.js` before publishing, or open the app's Settings panel and enter them there.

Never place a secret key or `service_role` key in this site. The supplied SQL enables Row Level Security, restricts every record to its owner, and explicitly grants only the client privileges the app needs.

## Publish on GitHub Pages

1. Add these files to a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch containing `index.html`, and use the repository root.
4. Open the GitHub Pages URL after deployment.

No build step is required for GitHub Pages. The Supabase JavaScript client is pinned to version `2.102.0` and loaded only when Supabase settings are present.

## Local test

With Node.js installed:

```sh
npm run dev
```

Then open `http://localhost:4173`. To validate the distributable files:

```sh
npm run build
```

## Data model

- `verse_groups`: name, displayed references, and the selected sentence IDs.
- `category_columns`: user-created matrix columns and their order.
- `group_category_cells`: the checked intersections between passage groups and category columns.

The Matthew text remains a versioned static asset in `data/matthew-data.js`; only the user's organization work is stored in Supabase.
