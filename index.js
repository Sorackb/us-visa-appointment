import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer';
import axios from 'axios';

let executionCounter = 0;

//#region Helper functions
const waitForSelectors = async (selectors, frame, options) => {
  for (const selector of selectors) {
    try {
      return await waitForSelector(selector, frame, options);
    } catch (err) {
    }
  }

  throw new Error(`Could not find element for selectors: ${JSON.stringify(selectors, null, 2)}`);
};

const scrollIntoViewIfNeeded = async (element, timeout) => {
  await waitForConnected(element, timeout);
  const isInViewport = await element.isIntersectingViewport({ threshold: 0 });
  if (isInViewport) {
    return;
  }
  await element.evaluate(element => {
    element.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'auto',
    });
  });
  await waitForInViewport(element, timeout);
};

const waitForConnected = async (element, timeout) => {
  await waitForFunction(async () => {
    return await element.getProperty('isConnected');
  }, timeout);
};

const waitForInViewport = async (element, timeout) => {
  await waitForFunction(async () => {
    return await element.isIntersectingViewport({ threshold: 0 });
  }, timeout);
};

const waitForSelector = async (selector, frame, options) => {
  if (!Array.isArray(selector)) {
    selector = [selector];
  }

  if (!selector.length) {
    throw new Error('Empty selector provided to waitForSelector');
  }
  let element = null;
  for (let i = 0; i < selector.length; i++) {
    const part = selector[i];

    if (element) {
      element = await element.waitForSelector(part, options);
    } else {
      element = await frame.waitForSelector(part, options);
    }
    if (!element) {
      throw new Error(`Could not find element: ${selector.join('>>')}`);
    }

    if (i < selector.length - 1) {
      element = (await element.evaluateHandle(el => el.shadowRoot ? el.shadowRoot : el)).asElement();
    }
  }
  if (!element) {
    throw new Error(`Could not find element: ${selector.join('|')}`);
  }
  return element;
};

const waitForFunction = async (fn, timeout) => {
  let isActive = true;

  setTimeout(() => {
    isActive = false;
  }, timeout);

  while (isActive) {
    const result = await fn();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error('Timed out');
};

const sleep = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

const notify = async (userToken, msg) => {
  console.log(msg);

  if (!userToken) {
    return;
  }

  await axios.post('https://api.pushover.net/1/messages.json', {
    token: 'ak1xhwwv8s7umm7qos7vmwh6m23xkr',
    user: userToken,
    message: msg,
  });
};

const initTimer = (executionCounter) => {
  let counter = 0;

  const trackers = [
    'Set the viewport to avoid elements changing places ',
    'Go to login page',
    'Click on username input',
    'Type username',
    'Hit tab to go to the password input',
    'Type password',
    'Tick the checkbox for agreement',
    'Retrieve current appointment data',
    'Click login button',
    'Go to appointment page',
    'Select multiple people if it is a group appointment',
    'Select the specified consular from the dropdown',
    'Check available dates from the API',
    'Click on date input',
    'Keep clicking next button until we find the first available date and click to that date',
    'Select the first available Time from the time dropdown',
    'Click on reschedule button',
    'Click on submit button on the confirmation popup',
  ];

  console.time(`${executionCounter} - Finished`);
  console.time(`${executionCounter} - ${trackers[counter]}`);

  const logNext = () => {
    if (counter >= trackers.length) {
      console.timeEnd(`${executionCounter} - Finished`);
      return;
    }

    console.timeEnd(`${executionCounter} - ${trackers[counter]}`);
    counter += 1;
    console.time(`${executionCounter} - ${trackers[counter]}`);
  };

  return logNext;
};

//#endregion

const runLogic = async ({
  currentDate,
  usernameInput,
  passwordInput,
  appointmentId,
  consularId,
  userToken,
  groupAppointment,
  executionCounter,
  region,
  browser,
}) => {
  const logNext = initTimer(executionCounter);
  //#region Init puppeteer
  const limitDate = new Date(currentDate);
  const page = await browser.newPage();
  const timeout = 5000;
  const navigationTimeout = 60000;
  const smallTimeout = 100;
  const dateUrl = `https://ais.usvisa-info.com/en-${region}/niv/schedule/${appointmentId}/appointment/days/${consularId}.json?appointments[expedite]=false`;
  let availableDates;

  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(navigationTimeout);
  await page.setRequestInterception(true);

  page.on('request', request => request.continue());

  page.on('response', async (response) => {
    if (response.url() === dateUrl) {
      availableDates = await response.json();
    }
  });
  //#endregion

  //#region Logic

  // Set the viewport to avoid elements changing places
  {
    const targetPage = page;
    await targetPage.setViewport({ 'width': 2078, 'height': 1479 });
    logNext();
  }

  // Go to login page
  {
    const targetPage = page;
    await targetPage.goto(`https://ais.usvisa-info.com/en-${region}/niv/users/sign_in`, { waitUntil: 'domcontentloaded' });
    logNext();
  }

  // Click on username input
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Email *'], ['#user_email']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await element.click({ offset: { x: 118, y: 21.453125 } });
    logNext();
  }

  // Type username
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Email *'], ['#user_email']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    const type = await element.evaluate(el => el.type);
    if (['textarea', 'select-one', 'text', 'url', 'tel', 'search', 'password', 'number', 'email'].includes(type)) {
      await element.type(usernameInput);
    } else {
      await element.focus();
      await element.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, usernameInput);
    }
    logNext();
  }

  // Hit tab to go to the password input
  {
    const targetPage = page;
    await targetPage.keyboard.down('Tab');
  }
  {
    const targetPage = page;
    await targetPage.keyboard.up('Tab');
    logNext();
  }

  // Type password
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Password'], ['#user_password']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    const type = await element.evaluate(el => el.type);
    if (['textarea', 'select-one', 'text', 'url', 'tel', 'search', 'password', 'number', 'email'].includes(type)) {
      await element.type(passwordInput);
    } else {
      await element.focus();
      await element.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, passwordInput);
    }
    logNext();
  }

  // Tick the checkbox for agreement
  {
    const targetPage = page;
    const element = await waitForSelectors([['#sign_in_form > div.radio-checkbox-group.margin-top-30 > label > div']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await element.click({ offset: { x: 9, y: 16.34375 } });
    logNext();
  }

  // Click login button
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Sign In[role="button"]'], ['#new_user > p:nth-child(9) > input']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await element.click({ offset: { x: 34, y: 11.34375 } });
    await targetPage.waitForNavigation();
    logNext();
  }

  // Retrieve current appointment data
  {
    const targetPage = page;
    const element = await waitForSelector('div.card > p.consular-appt', targetPage, { timeout, visible: true });
    const currentAppointment = await element.evaluate(el => el.textContent);
    const dateExtractionRegex = /([0-9]{1,2}) ([a-zA-Z]+), ([0-9]{4})/g;
    const [_, day, month, year] = dateExtractionRegex.exec(currentAppointment);

    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const appointmentDate = new Date(parseInt(year, 10), months.indexOf(month), parseInt(day, 10));
    console.log(`The current appointment date is "${appointmentDate.toISOString().slice(0, 10)}"`);

    if (appointmentDate < limitDate) {
      limitDate = appointmentDate;
    }
  }

  // Go to appointment page
  {
    const targetPage = page;
    await targetPage.goto(`https://ais.usvisa-info.com/en-${region}/niv/schedule/${appointmentId}/appointment`, { waitUntil: 'domcontentloaded' });
    logNext();
  }

  // Select multiple people if it is a group appointment
  {
    if (groupAppointment) {
      const targetPage = page;
      const element = await waitForSelectors([['aria/Continue'], ['#main > div.mainContent > form > div:nth-child(3) > div > input']], targetPage, { timeout, visible: true });
      await scrollIntoViewIfNeeded(element, timeout);
      await element.click({ offset: { x: 70.515625, y: 25.25 } });
    }
    logNext();
  }

  // Select the specified consular from the dropdown
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Consular Section Appointment', 'aria/[role="combobox"]'], ['#appointments_consulate_appointment_facility_id']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await page.select('#appointments_consulate_appointment_facility_id', consularId);
    await sleep(1000);
    logNext();
  }

  // Check available dates from the API
  {
    let count = 0;

    while(availableDates === undefined) {
      count += 1;

      if (count >= 10) {
        throw new Error(`Timeout while loading available dates`);
      }

      await sleep(1000);
    };

    if (availableDates.length <= 0) {
      console.log(`${executionCounter} - There are no available dates for consulate with id "${consularId}"`);
      return false;
    }

    const firstDate = new Date(availableDates[0].date);

    if (firstDate > limitDate) {
      console.log(`${executionCounter} - There is not an earlier date available than "${limitDate.toISOString().slice(0, 10)}"; The next available date is "${availableDates[0].date}"`);
      return false;
    }

    notify(userToken, `Found an earlier date! ${firstDate.toISOString().slice(0, 10)}`);
    logNext();
  }

  // Click on date input
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Date of Appointment *'], ['#appointments_consulate_appointment_date']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await element.click({ offset: { x: 394.5, y: 17.53125 } });
    await sleep(1000);
    logNext();
  }

  // Keep clicking next button until we find the first available date and click to that date
  {
    const targetPage = page;
    while (true) {
      try {
        const element = await waitForSelectors([['aria/25[role="link"]'], ['#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a']], targetPage, { timeout: smallTimeout, visible: true });
        await scrollIntoViewIfNeeded(element, timeout);
        await page.click('#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a');
        await sleep(500);
        break;
      } catch (err) {
        {
          const targetPage = page;
          const element = await waitForSelectors([['aria/Next', 'aria/[role="generic"]'], ['#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > div > a > span']], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 4, y: 9.03125 } });
        }
      }
    }
    logNext();
  }

  // Select the first available Time from the time dropdown
  {
    const targetPage = page;
    const element = await waitForSelectors([['#appointments_consulate_appointment_time']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await page.evaluate(() => {
      document.querySelector('#appointments_consulate_appointment_time option:nth-child(2)').selected = true;
      const event = new Event('change', { bubbles: true });
      document.querySelector('#appointments_consulate_appointment_time').dispatchEvent(event);
    })
    await sleep(1000);
    logNext();
  }

  // Click on reschedule button
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Reschedule'], ['#appointments_submit']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await element.click({ offset: { x: 78.109375, y: 20.0625 } });
    await sleep(1000);
    logNext();
  }

  // Click on submit button on the confirmation popup
  {
    const targetPage = page;
    const element = await waitForSelectors([['aria/Cancel'], ['body > div.reveal-overlay > div > div > a.button.alert']], targetPage, { timeout, visible: true });
    await scrollIntoViewIfNeeded(element, timeout);
    await page.click('body > div.reveal-overlay > div > div > a.button.alert');
    await sleep(5000);
    logNext();
  }

  logNext();
  return true;
  //#endregion
}

export const handler = async () => {
  const userToken = process.env.USER_TOKEN ?? '';
  let browser;

  executionCounter += 1;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const result = await runLogic({
      currentDate: new Date(process.env.US_VISA_CURRENT_DATE ?? ''),
      usernameInput: process.env.US_VISA_USERNAME ?? '',
      passwordInput: process.env.US_VISA_PASSWORD ?? '',
      appointmentId: process.env.US_VISA_APPOINTMENT_ID ?? '',
      consularId: process.env.US_VISA_CONSULAR_ID ?? '',
      groupAppointment: !!(process.env.US_VISA_GROUP ?? false),
      region: process.env.US_VISA_REGION ?? '',
      executionCounter,
      userToken,
      browser,
    });

    if (result) {
      notify(userToken, 'Successfully scheduled a new appointment');
    }
  } catch (err) {
    await browser?.close();
    throw err;
  }

  await browser?.close();

  return true;
};
