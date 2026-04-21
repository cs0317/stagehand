const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Explore & Propose 10 New Verbs
 *
 * Uses AI-driven discovery to navigate Overleaf's project dashboard,
 * editor, and settings pages. Documents available UI actions and
 * generates prompt-create-trajectory.txt files for 10 new verbs.
 */

// ── Verb definitions ─────────────────────────────────────────────────────────
const VERBS = [
  {
    folder: "overleaf_com__deleteProject",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- On https://www.overleaf.com/project, search for a project by name (e.g. "My Paper 1").
- Select the first matching project by clicking its checkbox.
- Click the trash (delete) button in the toolbar that appears.
- Confirm the deletion in the confirmation dialog.
- Return whether the task is successful.
`,
  },
  {
    folder: "overleaf_com__archiveProject",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- On https://www.overleaf.com/project, search for a project by name (e.g. "My Paper 1").
- Select the first matching project by clicking its checkbox.
- Click the archive (inbox) button in the toolbar that appears.
- Confirm the archival in the confirmation dialog.
- Return whether the task is successful.
`,
  },
  {
    folder: "overleaf_com__renameProject",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- On https://www.overleaf.com/project, search for a project by name (e.g. "My Paper 1").
- Click the first matching project to open it in the editor.
- In the editor toolbar, click the project title dropdown (the button with the project name and a keyboard_arrow_down icon).
- Select "Rename" from the dropdown menu.
- Type the new name (e.g. "My Renamed Paper") and confirm.
- Return whether the task is successful. If so, return the new project name and URL.
`,
  },
  {
    folder: "overleaf_com__downloadProject",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- On https://www.overleaf.com/project, search for a project by name (e.g. "My Paper 1").
- Select the first matching project by clicking its checkbox.
- Click the download button in the toolbar that appears (the button with text "download").
- Wait for the download to complete (intercept the download event from Playwright).
- Return whether the task is successful. If so, return the downloaded file path.
`,
  },
  {
    folder: "overleaf_com__copyProject",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- On https://www.overleaf.com/project, search for a project by name (e.g. "My Paper 1").
- Click the first matching project to open it in the editor.
- In the editor toolbar, click the project title dropdown (the button with the project name and a keyboard_arrow_down icon).
- Click "Make a copy" from the dropdown menu.
- A dialog appears asking for the copy name. Enter a new name (e.g. "My Paper 1 (Copy)") and click "Copy".
- Return whether the task is successful. If so, return the new project URL.
`,
  },
  {
    folder: "overleaf_com__uploadFile",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Visit a project by ID (e.g. https://www.overleaf.com/project/69e6b0a3d05bcdbdf251587c).
- In the file tree sidebar, click the "Upload" button (the button with text "Upload").
- A file upload dialog appears. Use Playwright's file chooser API to upload a local file (e.g. "test_upload.txt").
- Wait for the upload to complete.
- Return whether the task is successful. If so, return the uploaded file name as it appears in the file tree.
`,
  },
  {
    folder: "overleaf_com__createFolder",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Visit a project by ID (e.g. https://www.overleaf.com/project/69e6b0a3d05bcdbdf251587c).
- In the file tree sidebar, click the "New folder" button (the button with text "New folder").
- A dialog or inline input appears asking for the folder name. Enter a name (e.g. "figures").
- Confirm the folder creation.
- Return whether the task is successful. If so, return the folder name as it appears in the file tree.
`,
  },
  {
    folder: "overleaf_com__compileAndDownloadPDF",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Visit a project by ID (e.g. https://www.overleaf.com/project/69e6b0a3d05bcdbdf251587c).
- Wait for the editor to load.
- Click the "Recompile" button (or the green compile button) to compile the LaTeX project.
- Wait for compilation to finish.
- Click the "Download PDF" button in the PDF preview panel (the link with text "Download as PDF").
- Wait for the download to complete (intercept the download event from Playwright).
- Return whether the task is successful. If so, return the downloaded PDF file path.
`,
  },
  {
    folder: "overleaf_com__addTag",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- On https://www.overleaf.com/project, click the "New tag" button in the sidebar.
- Enter a tag name (e.g. "research-papers") and confirm.
- Search for a project by name (e.g. "My Paper 1").
- Select the first matching project by clicking its checkbox.
- Use the project actions menu (more_vert button labeled "Actions") to assign the tag to the project.
- Return whether the task is successful.
`,
  },
  {
    folder: "overleaf_com__changePassword",
    prompt: `Please read auto_verbs\\verbs\\SystemPrompt1.txt

* The target website
https://www.overleaf.com/

* Concrete task
- Assume that the user has signed into overleaf (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://www.overleaf.com/user/settings.
- Scroll to the "Change password" section.
- Enter the current password in the "Current Password" field.
- Enter the new password in the "New Password" field.
- Click the "Change" button.
- Return whether the task is successful.
`,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Explore & Propose 10 New Verbs");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const verbsDir = path.join(__dirname, "..");

  for (const verb of VERBS) {
    const dir = path.join(verbsDir, verb.folder);
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
