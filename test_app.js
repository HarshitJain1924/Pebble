const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const artifactDir = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\1670288a-b3ca-4567-9de8-5a41d2a9e509';
  
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  // Listen for console logs
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  // Listen for page errors
  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR]:`, err.toString());
  });

  console.log('Navigating to http://localhost:8082 ...');
  try {
    await page.goto('http://localhost:8082', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.error('Failed to navigate:', e);
  }

  // Wait a bit for page to load
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Setting onboarding completion in localStorage...');
  await page.evaluate(() => {
    localStorage.setItem("todoapp:onboarding_completed", "true");
    localStorage.setItem("AsyncStorage_todoapp:onboarding_completed", "true");
  });

  console.log('Reloading page...');
  await page.reload({ waitUntil: 'networkidle2' });

  // Wait for tab screen to load
  console.log('Waiting for application to load Dashboard...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Clicking the "Workspaces" tab in the bottom navigation...');
  await page.click('a[href="/tasks"]');

  console.log('Waiting 5s for Workspaces screen to load...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Taking screenshot of Workspaces screen...');
  const workspacesScreenPath = path.join(artifactDir, 'browser_workspaces_grid.png');
  await page.screenshot({ path: workspacesScreenPath });
  console.log(`Saved screenshot to ${workspacesScreenPath}`);

  // Find the position of "My Pebbles" card (deepest match first)
  const cardPosition = await page.evaluate(() => {
    const textElements = Array.from(document.querySelectorAll('div, span, p')).reverse();
    const myTasksTextEl = textElements.find(el => el.innerText && el.innerText.trim() === 'My Pebbles' && el.offsetWidth > 0);
    if (myTasksTextEl) {
      let parent = myTasksTextEl.parentElement;
      while (parent) {
        if (parent.style.cursor === 'pointer' || parent.getAttribute('tabindex') === '0' || parent.className.includes('r-cursor-1loqt21')) {
          const rect = parent.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: parent.innerText.slice(0, 40) };
        }
        parent = parent.parentElement;
      }
      const rect = myTasksTextEl.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: 'fallback' };
    }
    return null;
  });

  if (cardPosition) {
    console.log(`Clicking the "My Pebbles" folder card (${cardPosition.text}) at coordinates: x=${cardPosition.x}, y=${cardPosition.y}`);
    await page.mouse.click(cardPosition.x, cardPosition.y);

    console.log('Waiting 3s for Workspace details screen to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const workspaceDetailsPath = path.join(artifactDir, 'browser_workspace_details.png');
    await page.screenshot({ path: workspaceDetailsPath });
    console.log(`Saved screenshot to ${workspaceDetailsPath}`);

    // Now check if "Add task" card exists and click it (deepest match first)
    const addPosition = await page.evaluate(() => {
      const textElements = Array.from(document.querySelectorAll('div, span, p')).reverse();
      const addTextEl = textElements.find(el => el.innerText && el.innerText.includes('Add a task to') && el.offsetWidth > 0);
      if (addTextEl) {
        let parent = addTextEl.parentElement;
        while (parent) {
          if (parent.style.cursor === 'pointer' || parent.getAttribute('tabindex') === '0' || parent.className.includes('r-cursor-1loqt21')) {
            const rect = parent.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: parent.innerText.slice(0, 40) };
          }
          parent = parent.parentElement;
        }
        const rect = addTextEl.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: 'fallback-leaf' };
      }
      return null;
    });

    if (addPosition) {
      console.log(`Clicking "Add Task" bar (${addPosition.text}) at coordinates: x=${addPosition.x}, y=${addPosition.y}`);
      await page.mouse.click(addPosition.x, addPosition.y);

      console.log('Waiting 3s for the bottom sheet modal to animate/show...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const afterAddClickPath = path.join(artifactDir, 'browser_after_add_click.png');
      await page.screenshot({ path: afterAddClickPath });
      console.log(`Saved screenshot to ${afterAddClickPath}`);
      
      const html = await page.content();
      fs.writeFileSync(path.join(artifactDir, 'dom_after_add_click.html'), html);
    } else {
      console.log('Could not find Add Task bar position');
    }
  } else {
    console.log('Could not find My Pebbles folder card position');
  }

  await browser.close();
  console.log('Done!');
})();
