const fs = require("fs");
const path = require("path");

/**
 * Google Drive – Explore & Propose 10 New Verbs
 *
 * Generates prompt-create-trajectory.txt files for 10 Google Drive verbs
 * in the verbs-GoogleDrive-batch output folder.
 *
 * Key UI observations (from live exploration):
 * - Homepage: https://drive.google.com/ shows "My Drive" with files/folders
 * - New button: top-left "+ New" button opens a menu with upload/create options
 * - Right-click context menu: rename, share, move, download, trash, etc.
 * - Search bar: input at the top for searching files
 * - File/folder items: selectable rows in the main content area
 * - Details panel: right side panel with file info
 * - Breadcrumb navigation: shows current folder path
 */

// ── Verb definitions ─────────────────────────────────────────────────────────
const VERBS = [
  {
    folder: "drive_google_com__uploadFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Click the "+ New" button in the top-left area.
- Click "File upload" from the dropdown menu.
- Use Playwright's file chooser API to upload a test file (create a small temp .txt file for the test).
- Wait for the upload to complete (watch for the upload progress bar to disappear or a success notification).
- Return whether the task is successful. If so, return the uploaded file name.
`,
  },
  {
    folder: "drive_google_com__createFolder",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Click the "+ New" button in the top-left area.
- Click "New folder" from the dropdown menu.
- In the dialog that appears, clear the default name and type a new folder name (e.g. "Test Folder 1").
- Click "Create" to confirm.
- Wait for the folder to appear in the file list.
- Return whether the task is successful. If so, return the folder name.
`,
  },
  {
    folder: "drive_google_com__renameFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file by its current name (e.g. "Test File").
- In the context menu, click "Rename".
- In the rename input that appears, clear the existing name (Ctrl+A) and type the new name (e.g. "Renamed File").
- Press Enter to confirm the rename.
- Return whether the task is successful. If so, return the new file name.
`,
  },
  {
    folder: "drive_google_com__deleteFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file or folder by its name (e.g. "Test File").
- In the context menu, click "Move to trash".
- Wait for the confirmation snackbar/toast to appear (e.g. "1 item moved to trash").
- Return whether the task is successful.
`,
  },
  {
    folder: "drive_google_com__shareFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file by its name (e.g. "Test File").
- In the context menu, click "Share" > "Share".
- In the sharing dialog (which is inside an iframe at drivesharing), enter an email address (e.g. "collaborator@example.com") in the "Add people" input field.
- Set the permission level (e.g. "Editor").
- Click "Send" to share.
- Return whether the task is successful.
`,
  },
  {
    folder: "drive_google_com__downloadFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file by its name (e.g. "Test File").
- In the context menu, click "Download".
- Wait for the download to complete (intercept the download event from Playwright).
- Return whether the task is successful. If so, return the downloaded file path.
`,
  },
  {
    folder: "drive_google_com__moveFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file by its name (e.g. "Test File").
- In the context menu, click "Organise" (or "Move to").
- In the dialog that appears, select a destination folder (e.g. "Test Folder 1").
- Click "Move" to confirm.
- Return whether the task is successful. If so, return the destination folder name.
`,
  },
  {
    folder: "drive_google_com__searchFiles",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Click the search bar at the top of the page.
- Type a search query (e.g. "Test").
- Press Enter to execute the search.
- Wait for search results to load.
- Extract the names of the files/folders shown in the search results (up to 10).
- Return whether the task is successful. If so, return the list of matching file/folder names.
`,
  },
  {
    folder: "drive_google_com__starFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file by its name (e.g. "Test File").
- In the context menu, click "Add to Starred" (or the star icon).
- Wait for the confirmation (star icon becomes filled).
- Navigate to https://drive.google.com/drive/starred to verify the file appears there.
- Return whether the task is successful.
`,
  },
  {
    folder: "drive_google_com__copyFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Find and right-click on a file by its name (e.g. "Test File").
- In the context menu, click "Make a copy".
- Wait for the copy to appear in the file list (usually named "Copy of <filename>").
- Return whether the task is successful. If so, return the name of the copied file.
`,
  },
  {
    folder: "drive_google_com__openFile",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://drive.google.com/

* Concrete task
- Assume that the user has signed into Google (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://drive.google.com/drive/my-drive.
- Wait for the Drive UI to load.
- Click the search bar at the top of the page.
- Type a search query (e.g. "Test").
- Press Enter to execute the search.
- Wait for search results to load.
- Double-click the first matching file/folder in the search results to open it.
- Wait for the file to open (e.g. a Google Doc, Sheet, or Slide editor, or a folder view).
- Return whether the task is successful. If so, return the opened file/folder name and its URL.
`,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Drive – Explore & Propose 10 New Verbs");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const batchDir = path.join(__dirname, "..", "verbs-GoogleDrive-batch");

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
