# Verb Automation Coverage Report

**Total: 646 verbs across 13 batches**

Each verb has a JS generator (`genPython()`) and a Python Playwright script for browser automation against a target website.

---

## By Platform Category

| Category | Verbs | Batch(es) |
|---|---|---|
| **Cloud & DevOps (Azure Portal)** | 11 | verbs-AzurePortal-batch |
| **Productivity — Google Docs** | 9 | verbs-GoogleDocs-batch |
| **Productivity — Google Drive** | 11 | verbs-GoogleDrive-batch |
| **Productivity — Overleaf (LaTeX)** | 15 | verbs-Overleaf-batch |
| **General Web (public sites)** | 600 | verbs-batch1 through batch9 |

---

## Azure Portal (11 verbs)

openService, createResourceGroup, deleteResourceGroup, createStorageAccount, createWebApp, openCloudShell, viewCostAnalysis, listVirtualMachines, viewActivityLog, viewResourceGroupResources, setSubscriptionBudget

## Google Docs (9 verbs)

createDocument, createDocumentFromTemplate, deleteDocument, downloadDocument, findAndReplace, insertTable, makeACopy, renameDocument, shareDocument

## Google Drive (11 verbs)

copyFile, createFolder, deleteFile, downloadFile, moveFile, openFile, renameFile, searchFiles, shareFile, starFile, uploadFile

## Overleaf (15 verbs)

addTag, archiveProject, compileAndDownloadPDF, copyProject, createFolder, createGitAuthToken, createProject, deleteProject, downloadProject, gitClone, githubClone, renameProject, shareProject, uploadFile, visitProject

---

## General Web — 600 verbs across 9 batches

Covering the following domains:

- **E-commerce & Shopping** (~80+): amazon, ebay, etsy, bestbuy, walmart, target, nike, nordstrom, sephora, ikea, costco, newegg, etc.
- **Travel & Hospitality** (~40+): airbnb, booking, expedia, kayak, tripadvisor, vrbo, hostelworld, cruisecritic, etc.
- **Food & Restaurants** (~35+): allrecipes, grubhub, ubereats, opentable, dominos, starbucks, epicurious, bonappetit, etc.
- **Finance & Investing** (~35+): bankofamerica, chase, fidelity, yahoo finance, coinmarketcap, morningstar, stockanalysis, finviz, etc.
- **Entertainment & Media** (~50+): imdb, rottentomatoes, youtube, spotify, twitch, letterboxd, etc.
- **News & Publishing** (~30+): nytimes, bbc, cnn, npr, techcrunch, theguardian, arstechnica, wired, etc.
- **Jobs & Careers** (~15+): indeed, glassdoor, dice, weworkremotely, simplyhired, etc.
- **Education & Learning** (~25+): coursera, edx, khanacademy, codecademy, duolingo, skillshare, freecodecamp, etc.
- **Health & Wellness** (~20+): webmd, mayoclinic, healthline, drugs, medlineplus, etc.
- **Real Estate** (~15+): zillow, realtor, rent, hotpads, movoto, compass, etc.
- **Developer Tools** (~20+): github (5 variants), stackoverflow, npmjs, huggingface, kaggle, paperswithcode, etc.
- **Government & Civic** (~25+): irs, usa.gov, congress, census, regulations, fda, epa, cdc, nasa, etc.
- **Sports** (~25+): espn, nba, nfl, mlb, nhl, formula1, ufc, premierleague, etc.
- **Maps & Local** (~10+): google maps (4 variants), mapquest, yellowpages, etc.
- **Reference & Knowledge** (~15+): wikipedia (3 variants), britannica, dictionary, merriam-webster, etc.
- **Arts & Design** (~15+): behance, dribbble, unsplash, pexels, artstation, moma, metmuseum, etc.
- **Social & Community** (~15+): pinterest, medium, substack, mastodon, wattpad, etc.
- **Automotive** (~10+): autotrader, carvana, kbb, cargurus, edmunds, caranddriver, etc.
- **Pets & Animals** (~8+): petfinder, petsmart, akc, adoptapet, bringfido, etc.
- **Gaming** (~12+): steam, rawg, igdb, nexusmods, speedrun, howlongtobeat, etc.
- **Crypto & DeFi** (~6+): coinmarketcap, coingecko, etherscan, coindesk, defillama, etc.

