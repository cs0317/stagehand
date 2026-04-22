const fs = require("fs");
const path = require("path");

/**
 * Google Docs – Explore & Propose 10 New Verbs
 *
 * Generates prompt-create-trajectory.txt files for 10 Google Docs verbs
 * in the verbs-GoogleDocs-batch output folder.
 *
 * Key UI observations (from live exploration):
 * - Homepage: https://docs.google.com/ shows template gallery + recent docs
 * - New doc: https://docs.google.com/document/create redirects to editor
 * - Title input: input[aria-label="Rename"] with the document title
 * - Share button: div[aria-label*="Share"]
 * - File menu: File > New, Open, Make a copy, Download, Rename, Move to trash, etc.
 * - Insert menu: Image, Table, Drawing, Chart, Link, Comment, Footnote, etc.
 * - Format menu: Text, Paragraph styles, Align, Line spacing, Columns, etc.
 * - Tools menu: Spelling, Word count, Translate, Voice typing, etc.
 */

// ── Verb definitions ─────────────────────────────────────────────────────────
const VERBS = [
  {
    folder: "docs_google_com__createDocument",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://docs.google.com/document/create to create a new blank document.
- Wait for the editor to load.
- Rename the document by clicking the title input (input[aria-label="Rename"]) at the top, clearing it, and typing the new name (e.g. "Test Document 1").
- Type some sample text into the document body (e.g. "Hello, this is a test document.").
- Return whether the task is successful. If so, return the document URL and the document title.
`,
  },
  {
    folder: "docs_google_com__createDocumentFromTemplate",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://docs.google.com/ to see the homepage with template gallery.
- Click "Template gallery" to expand the full list of templates.
- Find and click a template by name (e.g. "Resume Serif" or "Letter Spearmint").
- Wait for the new document editor to load.
- Rename the document to a given name (e.g. "My Resume") by clicking the title input (input[aria-label="Rename"]).
- Return whether the task is successful. If so, return the document URL and the document title.
`,
  },
  {
    folder: "docs_google_com__renameDocument",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Click the document title input (input[aria-label="Rename"]) at the top of the page.
- Clear the existing name (Ctrl+A) and type the new name (e.g. "Renamed Document").
- Press Enter or click outside to confirm.
- Return whether the task is successful. If so, return the new document title.
`,
  },
  {
    folder: "docs_google_com__shareDocument",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Click the Share button (div[aria-label*="Share"]) in the top-right area.
- In the sharing dialog, enter an email address (e.g. "collaborator@example.com") in the "Add people" input field.
- Set the permission to "Editor" (or "Viewer" depending on the parameter).
- Click "Send" or "Share" to confirm.
- Return whether the task is successful.
`,
  },
  {
    folder: "docs_google_com__downloadDocument",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Open the File menu by clicking "File" in the menu bar.
- Hover over "Download" to open the sub-menu.
- Click the desired format (e.g. "PDF Document (.pdf)" or "Microsoft Word (.docx)").
- Wait for the download to complete (intercept the download event from Playwright).
- Return whether the task is successful. If so, return the downloaded file path.
`,
  },
  {
    folder: "docs_google_com__deleteDocument",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Open the File menu by clicking "File" in the menu bar.
- Click "Move to trash" from the File menu.
- Wait for the confirmation or the page to update.
- Return whether the task is successful.
`,
  },
  {
    folder: "docs_google_com__makeACopy",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Open the File menu by clicking "File" in the menu bar.
- Click "Make a copy" from the File menu.
- A dialog appears. Optionally change the copy name (e.g. "Copy of Test Document 1") and click "Make a copy" to confirm.
- Wait for the new document to open in a new tab. Switch to that tab.
- Return whether the task is successful. If so, return the new document URL and title.
`,
  },
  {
    folder: "docs_google_com__insertTable",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Click at the end of the document body to place the cursor.
- Open the Insert menu by clicking "Insert" in the menu bar.
- Hover over "Table" to see the table size grid.
- Select a table size (e.g. 3 columns x 2 rows) by clicking on the appropriate cell in the grid.
- Return whether the task is successful.
`,
  },
  {
    folder: "docs_google_com__findAndReplace",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Open Find and Replace by pressing Ctrl+H (or via Edit menu > "Find and replace").
- In the "Find" input, type the search text (e.g. "hello").
- In the "Replace with" input, type the replacement text (e.g. "world").
- Click "Replace all" to replace all occurrences.
- Note the number of replacements made (if displayed).
- Close the Find and Replace dialog.
- Return whether the task is successful. If so, return the number of replacements.
`,
  },
  {
    folder: "docs_google_com__addComment",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://docs.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Open a document by its URL (e.g. https://docs.google.com/document/d/<doc_id>/edit).
- Wait for the editor to load.
- Select some text in the document body (e.g. triple-click to select a paragraph, or use Ctrl+A to select all).
- Press Ctrl+Alt+M to open the comment dialog (or click Insert > Comment).
- Type a comment (e.g. "Please review this section.").
- Click the "Comment" button to submit.
- Return whether the task is successful.
`,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Explore & Propose 10 New Verbs");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const batchDir = path.join(__dirname, "..", "verbs-GoogleDocs-batch");

  for (const verb of VERBS) {
    const dir = path.join(batchDir, verb.folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const promptPath = path.join(dir, "prompt-create-trajectory.txt");
    fs.writeFileSync(promptPath, verb.prompt, "utf-8");
    console.log(`✅ ${verb.folder}/prompt-create-trajectory.txt`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  ✅ DONE — Created ${VERBS.length} verb prompt files`);
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(console.error);
