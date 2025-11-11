/**
 * Auto-Scheduling Calendar
 * This script handles calendar management and automatic task scheduling
 */

// Cookie utility functions
const CookieManager = {
  /**
   * Set a cookie
   * @param {String} name - Cookie name
   * @param {String} value - Cookie value
   * @param {Number} days - Days until expiration (default 365)
   */
  set(name, value, days = 365) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/;SameSite=Lax";
  },

  /**
   * Get a cookie value
   * @param {String} name - Cookie name
   * @returns {String|null} Cookie value or null if not found
   */
  get(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        return decodeURIComponent(c.substring(nameEQ.length, c.length));
      }
    }
    return null;
  },

  /**
   * Delete a cookie
   * @param {String} name - Cookie name
   */
  delete(name) {
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
  }
};

class Calendar {
  constructor() {
    this.events = [];
    this.tasks = [];
    this.settings = {
      workingHours: {
        start: 9, // 9 AM
        end: 17, // 5 PM
      },
      workDays: [1, 2, 3, 4, 5], // Monday to Friday (0 = Sunday, 6 = Saturday)
      defaultTaskDuration: 60, // minutes
      minBreakBetweenTasks: 15, // minutes
    };

    // Bind methods
    this.addTask = this.addTask.bind(this);
    this.addEvent = this.addEvent.bind(this);
    this.autoScheduleTasks = this.autoScheduleTasks.bind(this);
    this.getAvailableSlots = this.getAvailableSlots.bind(this);
    this.renderCalendar = this.renderCalendar.bind(this);
    this.importGoogleCalendar = this.importGoogleCalendar.bind(this);

    // Initialize
    this.initCalendar();
  }

  /**
   * Initialize calendar UI and event listeners
   */
  initCalendar() {
    // Set up event listeners once DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
      // Load saved calendar URL from cookie
      this.loadSavedCalendarUrl();

      // --- FIX: Auto-import from saved cookie URL on load ---
      const urlInput = document.getElementById('google-calendar-url');
      if (urlInput && urlInput.value) {
        console.log('Found saved calendar URL, attempting auto-import...');
        this.importGoogleCalendar(urlInput.value, 14) // Use default 14 days
          .then(result => {
            console.log(`Auto-import successful: ${result.count} events loaded.`);
          })
          .catch(err => {
            console.warn(`Auto-import from cookie failed: ${err.message}`);
            // Fail silently, user can manually import if needed
          });
      }
      // --- End of fix ---

      // Task form submission
      const taskForm = document.getElementById('task-form');
      if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
          e.preventDefault();

          const taskName = document.getElementById('task-name').value;
          const taskPriority = parseInt(document.getElementById('task-priority').value);
          const taskDuration = parseInt(document.getElementById('task-duration').value);
          const taskDeadline = document.getElementById('task-deadline').value;

          this.addTask({
            name: taskName,
            priority: taskPriority,
            duration: taskDuration,
            deadline: new Date(taskDeadline),
            isScheduled: false,
            isCompleate:false
          });

          // Auto-schedule after adding a new task
          this.autoScheduleTasks();
          this.renderCalendar();
          

          // Reset form
          taskForm.reset();
        });
        CookieManager.set(tasksList,String(tasks)); //create cookie for tasks
        //TODO - make it load saved uncompleaded tasks
      }

      // Event form submission
      const eventForm = document.getElementById('event-form');
      if (eventForm) {
        eventForm.addEventListener('submit', (e) => {
          e.preventDefault();

          const eventName = document.getElementById('event-name').value;
          const eventStart = document.getElementById('event-start').value;
          const eventEnd = document.getElementById('event-end').value;

          this.addEvent({
            name: eventName,
            start: new Date(eventStart),
            end: new Date(eventEnd),
            isFixed: true
          });

          // Re-schedule tasks after adding a fixed event
          this.autoScheduleTasks();
          this.renderCalendar();

          // Reset form
          eventForm.reset();
        });
      }

      // Initial render
      this.renderCalendar();
    });
  }

  /**
   * Load saved calendar URL from cookie and populate the input field
   */
  loadSavedCalendarUrl() {
    const savedUrl = CookieManager.get('google_calendar_ics_url');
    const urlInput = document.getElementById('google-calendar-url');

    if (savedUrl && urlInput) {
      urlInput.value = savedUrl;
      console.log('Loaded saved calendar URL from cookie');
    }
  }

  /**
   * Save calendar URL to cookie
   * @param {String} url - Calendar URL to save
   */
  saveCalendarUrl(url) {
    if (url && url.trim()) {
      CookieManager.set('google_calendar_ics_url', url.trim(), 365);
      console.log('Calendar URL saved to cookie');
    }
  }

  /**
   * Clear saved calendar URL
   */
  clearSavedCalendarUrl() {
    CookieManager.delete('google_calendar_ics_url');
    console.log('Calendar URL cleared from cookie');
  }

  /**
   * Add a task to be scheduled
   * @param {Object} task - Task to add
   */
  addTask(task) {
    // Ensure task has all required properties
    const newTask = {
      id: this.generateId(),
      name: task.name,
      priority: task.priority || 1,
      duration: task.duration || this.settings.defaultTaskDuration,
      deadline: task.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
      isScheduled: false,
      scheduledStart: null,
      scheduledEnd: null
    };

    this.tasks.push(newTask);
    console.log(`Task added: ${newTask.name}`);

    return newTask;
  }

  /**
   * Add a fixed event (meeting, appointment, etc.)
   * @param {Object} event - Event to add
   */
  addEvent(event) {
    const newEvent = {
      id: this.generateId(),
      name: event.name,
      start: event.start,
      end: event.end,
      isFixed: true,
      isImported: event.isImported || false
    };

    this.events.push(newEvent);
    console.log(`Event added: ${newEvent.name}`);

    return newEvent;
  }

  /**
   * Automatically schedule all unscheduled tasks
   */
  autoScheduleTasks() {
    // Clear previous scheduling for all tasks
    this.tasks.forEach(task => {
      task.isScheduled = false;
      task.scheduledStart = null;
      task.scheduledEnd = null;
    });

    // Remove previously scheduled tasks from the events array
    this.events = this.events.filter(event => !event.isTask);

    // Sort tasks by priority (highest first) and deadline (earliest first)
    const taskQueue = [...this.tasks].sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.deadline - b.deadline; // Earlier deadline first
    });

    // Get all available time slots
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const availableSlots = this.getAvailableSlots(now, twoWeeksFromNow);

    // Schedule each task
    taskQueue.forEach(task => {
      // Find a suitable slot for this task
      for (let i = 0; i < availableSlots.length; i++) {
        const slot = availableSlots[i];
        const slotDuration = (slot.end - slot.start) / (60 * 1000); // in minutes

        if (slotDuration >= task.duration) {
          // Schedule the task in this slot
          task.scheduledStart = new Date(slot.start);
          task.scheduledEnd = new Date(slot.start.getTime() + task.duration * 60 * 1000);
          task.isScheduled = true;

          // Update the available slot
          if (slotDuration === task.duration) {
            // Remove this slot as it's fully used
            availableSlots.splice(i, 1);
          } else {
            // Reduce the slot size
            slot.start = new Date(slot.start.getTime() + task.duration * 60 * 1000 +
              this.settings.minBreakBetweenTasks * 60 * 1000);
          }

          // Add the scheduled task to events
          this.events.push({
            id: task.id,
            name: task.name,
            start: task.scheduledStart,
            end: task.scheduledEnd,
            isFixed: false,
            isTask: true,
            taskId: task.id
          });

          break;
        }
      }

      if (!task.isScheduled) {
        console.warn(`Could not schedule task: ${task.name}`);
      }
    });

    console.log(`Scheduled ${this.tasks.filter(t => t.isScheduled).length} out of ${this.tasks.length} tasks`);
  }

  /**
   * Get available time slots between start and end dates
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} Available time slots
   */
  getAvailableSlots(startDate, endDate) {
    const slots = [];
    const currentDate = new Date(startDate);

    // Reset to start of day
    currentDate.setHours(0, 0, 0, 0);

    // Get all fixed events
    const fixedEvents = this.events.filter(event => event.isFixed || event.isTask);

    // Iterate through each day
    while (currentDate < endDate) {
      const dayOfWeek = currentDate.getDay();

      // Check if it's a working day
      if (this.settings.workDays.includes(dayOfWeek)) {
        // Set working hours for this day
        const dayStart = new Date(currentDate);
        dayStart.setHours(this.settings.workingHours.start, 0, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(this.settings.workingHours.end, 0, 0, 0);

        // Adjust if start date is in the middle of a working day
        const effectiveStart = startDate > dayStart ? startDate : dayStart;

        // Skip if the effective start is after working hours
        if (effectiveStart < dayEnd) {
          // Find events for this day
          const dayEvents = fixedEvents.filter(event => {
            return event.start < dayEnd && event.end > effectiveStart;
          }).sort((a, b) => a.start - b.start);

          // Start with the full day as available
          let timePointer = new Date(effectiveStart);

          // Process each event and create slots around it
          dayEvents.forEach(event => {
            if (timePointer < event.start) {
              slots.push({
                start: new Date(timePointer),
                end: new Date(event.start)
              });
            }
            timePointer = new Date(event.end);
          });

          // Add the final slot after the last event
          if (timePointer < dayEnd) {
            slots.push({
              start: new Date(timePointer),
              end: new Date(dayEnd)
            });
          }
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    // Filter out slots that are too short
    return slots.filter(slot => {
      const durationMinutes = (slot.end - slot.start) / (60 * 1000);
      return durationMinutes >= this.settings.minBreakBetweenTasks;
    });
  }

  /**
   * Render calendar to the UI
   */
  renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    // Clear existing content
    calendarEl.innerHTML = '';

    // Sort all events by start time
    const allEvents = [...this.events].sort((a, b) => a.start - b.start);

    // Group events by date
    const eventsByDate = {};
    allEvents.forEach(event => {
      if (!event.start) return; // Skip events without a start date
      const dateKey = event.start.toDateString();
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push(event);
    });

    // Create calendar view
    Object.keys(eventsByDate).sort((a, b) => new Date(a) - new Date(b)).forEach(dateKey => {
      const dateEvents = eventsByDate[dateKey];

      // Create date header
      const dateHeader = document.createElement('h3');
      dateHeader.textContent = dateKey;
      calendarEl.appendChild(dateHeader);

      // Create events list
      const eventsList = document.createElement('ul');
      eventsList.className = 'events-list';

      dateEvents.forEach(event => {
        const eventItem = document.createElement('li');

        // Determine event class
        if (event.isImported) {
          eventItem.className = 'imported-event';
        } else if (event.isTask) {
          eventItem.className = 'task-event';
        } else {
          eventItem.className = 'fixed-event';
        }

        const startTime = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let badgeHTML = '';
        if (event.isTask) {
          badgeHTML = '<span class="event-badge">Task</span>';
        } else if (event.isImported) {
          badgeHTML = '<span class="event-badge imported-badge">Imported</span>';
        }

        eventItem.innerHTML = `
          <span class="event-time">${startTime} - ${endTime}</span>
          <span class="event-name">${event.name}</span>
          ${badgeHTML}
        `;

        eventsList.appendChild(eventItem);
      });

      calendarEl.appendChild(eventsList);
    });

    // Render unscheduled tasks if any
    const unscheduledTasks = this.tasks.filter(task => !task.isScheduled);
    if (unscheduledTasks.length > 0) {
      const unscheduledHeader = document.createElement('h3');
      unscheduledHeader.textContent = 'Unscheduled Tasks';
      calendarEl.appendChild(unscheduledHeader);

      const tasksList = document.createElement('ul');
      tasksList.className = 'unscheduled-tasks';

      unscheduledTasks.forEach(task => {
        const taskItem = document.createElement('li');
        taskItem.innerHTML = `
          <span class="task-name">${task.name}</span>
          <span class="task-details">
            Priority: ${task.priority}, 
            Duration: ${task.duration} mins, 
            Deadline: ${task.deadline.toLocaleDateString()}
          </span>
        `;
        tasksList.appendChild(taskItem);
      });

      calendarEl.appendChild(tasksList);
    }
  }

  /**
   * Import events from a public Google Calendar
   * @param {String} calendarInput - Calendar URL or ID or .ics URL
   * @param {Number} daysAhead - Number of days to import (default 14)
   */
  async importGoogleCalendar(calendarInput, daysAhead = 14) {
    try {
      console.log('Starting import with input:', calendarInput);

      // Save the URL to cookie for future use
      this.saveCalendarUrl(calendarInput);

      // Determine if input is already an .ics URL
      let icalUrl;
      if (calendarInput.includes('.ics')) {
        // Already an .ics URL, use it directly
        icalUrl = calendarInput;
        console.log('Using provided .ics URL directly');
      } else {
        // Extract calendar ID and construct .ics URL
        const calendarId = this.extractCalendarId(calendarInput);

        if (!calendarId) {
          throw new Error('Invalid calendar URL or ID format. Please provide an email address, calendar URL, or direct .ics link.');
        }

        // Construct iCalendar URL
        icalUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
      }

      console.log('Fetching calendar from:', icalUrl);

      // Calculate date range
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      // Try multiple CORS proxy options
      const proxyOptions = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
      ];

      let icalData = null;
      let lastError = null;

      // Try each proxy until one works
      for (const proxyUrl of proxyOptions) {
        try {
          console.log('Trying proxy:', proxyUrl);
          const response = await fetch(proxyUrl + encodeURIComponent(icalUrl), {
            method: 'GET',
            headers: {
              'Accept': 'text/calendar'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          icalData = await response.text();

          // Check if we got valid iCalendar data
          if (!icalData || !icalData.includes('BEGIN:VCALENDAR')) {
            throw new Error('Response does not contain valid iCalendar data');
          }

          console.log('Successfully fetched calendar data');
          break; // Success, exit loop
        } catch (error) {
          console.warn(`Proxy ${proxyUrl} failed:`, error.message);
          lastError = error;
          continue; // Try next proxy
        }
      }

      if (!icalData) {
        throw new Error(`Failed to fetch calendar after trying multiple proxies. Last error: ${lastError?.message || 'Unknown error'}. Make sure the calendar is public.`);
      }

      console.log('Parsing calendar data...');

      // Parse iCalendar data
      const events = this.parseICalendar(icalData, now, futureDate);

      if (events.length === 0) {
        console.warn('No events found in the specified date range');
        // Note: Don't throw an error, just means no events to import
      }

      console.log(`Parsed ${events.length} events`);

      // Add events to calendar
      let importedCount = 0;
      events.forEach(event => {
        this.addEvent({
          name: event.summary || 'Untitled Event',
          start: event.start,
          end: event.end,
          isFixed: true,
          isImported: true
        });
        importedCount++;
      });

      // Re-schedule tasks to account for new events
      this.autoScheduleTasks();
      this.renderCalendar();

      console.log(`Successfully imported ${importedCount} events from Google Calendar`);

      return { success: true, count: importedCount };
    } catch (error) {
      console.error('Error importing Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Extract calendar ID from various input formats
   * @param {String} input - Calendar URL or ID
   * @returns {String} Calendar ID
   */
  extractCalendarId(input) {
    // If it's just an email address, return it
    if (input.includes('@') && !input.includes('/')) {
      return input;
    }

    // Try to extract from embed URL
    const srcMatch = input.match(/src=([^&]+)/);
    if (srcMatch) {
      return decodeURIComponent(srcMatch[1]);
    }

    // Try to extract from ical URL
    const icalMatch = input.match(/calendar\/ical\/([^\/]+)/);
    if (icalMatch) {
      return decodeURIComponent(icalMatch[1]);
    }

    // Return as-is if no pattern matches
    return input;
  }

  /**
   * Parse iCalendar format data
   * @param {String} icalData - iCalendar format string
   * @param {Date} startDate - Filter events after this date
   * @param {Date} endDate - Filter events before this date
   * @returns {Array} Parsed events
   */
  parseICalendar(icalData, startDate, endDate) {
    const events = [];
    // Split the response into individual VEVENT blocks
    const eventBlocks = icalData.split('BEGIN:VEVENT');

    // Skip the first element (before first VEVENT)
    for (let i = 1; i < eventBlocks.length; i++) {
      const eventBlock = eventBlocks[i];
      const event = {};

      // Helper to find a property value using regex
      const getMatch = (regex) => {
        const match = eventBlock.match(regex);
        return match ? match[1].trim() : null;
      };

      // Helper for multi-line properties like DESCRIPTION
      const getMultiLineMatch = (key) => {
          // This regex finds the key, then captures everything until the next line that doesn't start with a space or tab.
          const regex = new RegExp(`${key}:((?:.*?)(?:\\r?\\n(?:[ \\t].*?))*)`, 'i');
          const match = eventBlock.match(regex);
          if (match) {
              // Clean up the matched string by removing the line breaks and subsequent whitespace
              return match[1].replace(/\r?\n[ \t]/g, '').trim();
          }
          return null;
      };

      event.summary = getMatch(/SUMMARY:(.*?)(?:\r?\n)/i);
      event.location = getMatch(/LOCATION:(.*?)(?:\r?\n)/i);
      event.uid = getMatch(/UID:(.*?)(?:\r?\n)/i);

      // Handle descriptions which can span multiple lines
      event.description = getMultiLineMatch('DESCRIPTION');

      const dtstartMatch = getMatch(/DTSTART(?:;[^:]*)?:(.*?)(?:\r?\n)/i);
      if (dtstartMatch) {
        event.start = this.parseICalDate(dtstartMatch);
      }

      const dtendMatch = getMatch(/DTEND(?:;[^:]*)?:(.*?)(?:\r?\n)/i);
      if (dtendMatch) {
        event.end = this.parseICalDate(dtendMatch);
      }

      // Only add events that are within the specified date range
      if (event.start && event.end) {
        if (event.start <= endDate && event.end >= startDate) {
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * Parse iCalendar date format to JavaScript Date
   * @param {String} icalDate - iCalendar date string
   * @returns {Date} JavaScript Date object
   */
  parseICalDate(icalDate) {
    // Remove TZID and other parameters
    icalDate = icalDate.split(':').pop();

    // iCalendar format: YYYYMMDDTHHMMSSZ or YYYYMMDD
    if (icalDate.length === 8) {
      // All-day event (YYYYMMDD)
      const year = parseInt(icalDate.substring(0, 4));
      const month = parseInt(icalDate.substring(4, 6)) - 1;
      const day = parseInt(icalDate.substring(6, 8));
      return new Date(year, month, day);
    } else {
      // Date with time
      const year = parseInt(icalDate.substring(0, 4));
      const month = parseInt(icalDate.substring(4, 6)) - 1;
      const day = parseInt(icalDate.substring(6, 8));
      const hour = parseInt(icalDate.substring(9, 11));
      const minute = parseInt(icalDate.substring(11, 13));
      const second = parseInt(icalDate.substring(13, 15));

      if (icalDate.endsWith('Z')) {
        // UTC time
        return new Date(Date.UTC(year, month, day, hour, minute, second));
      } else {
        // Local time
        return new Date(year, month, day, hour, minute, second);
      }
    }
  }

  /**
   * Generate a unique ID
   * @returns {String} Unique ID
   */
  generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Export calendar data
   * @returns {Object} Calendar data
   */
  exportData() {
    return {
      events: this.events,
      tasks: this.tasks,
      settings: this.settings
    };
  }

  /**
   * Import calendar data
   * @param {Object} data - Calendar data to import
   */
  importData(data) {
    if (data.events) this.events = data.events.map(e => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end)
    }));
    if (data.tasks) this.tasks = data.tasks.map(t => ({
      ...t,
      deadline: new Date(t.deadline),
      scheduledStart: t.scheduledStart ? new Date(t.scheduledStart) : null,
      scheduledEnd: t.scheduledEnd ? new Date(t.scheduledEnd) : null
    }));
    if (data.settings) this.settings = data.settings;

    this.renderCalendar();
  }
}

// Initialize the calendar
const autoScheduler = new Calendar();

// Export to global scope for browser console access
window.autoScheduler = autoScheduler;

// If you're using modules, uncomment the following line:
// export default Calendar;

// Set default deadline to tomorrow
document.addEventListener('DOMContentLoaded', function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0);

  const deadlineField = document.getElementById('task-deadline');
  const eventStart = document.getElementById('event-start');
  const eventEnd = document.getElementById('event-end');

  if (deadlineField) {
    deadlineField.value = tomorrow.toISOString().slice(0, 16);
  }

  if (eventStart && eventEnd) {
    const now = new Date();
    const hourLater = new Date();
    hourLater.setHours(now.getHours() + 1);

    eventStart.value = now.toISOString().slice(0, 16);
    eventEnd.value = hourLater.toISOString().slice(0, 16);
  }

  // Set up settings form
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', function(e) {
      e.preventDefault();

      // Get working hours
      const workStart = document.getElementById('work-start').value;
      const workEnd = document.getElementById('work-end').value;
      const startHour = parseInt(workStart.split(':')[0]);
      const endHour = parseInt(workEnd.split(':')[0]);

      // Get working days
      const workDays = [];
      document.querySelectorAll('input[name="workday"]:checked').forEach(el => {
        workDays.push(parseInt(el.value));
      });

      // Get other settings
      const minBreak = parseInt(document.getElementById('min-break').value);
      const defaultDuration = parseInt(document.getElementById('default-duration').value);

      // Update settings
      autoScheduler.settings.workingHours.start = startHour;
      autoScheduler.settings.workingHours.end = endHour;
      autoScheduler.settings.workDays = workDays;
      autoScheduler.settings.minBreakBetweenTasks = minBreak;
      autoScheduler.settings.defaultTaskDuration = defaultDuration;

      // Re-schedule and render
      autoScheduler.autoScheduleTasks();
      autoScheduler.renderCalendar();

      // Use a non-blocking notification
      showStatusMessage('Settings saved!', 'success');
    });
  }
});

// Tab functionality
function openTab(event, tabId) {
  // Hide all tabs
  const tabs = document.getElementsByClassName('tab-content');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
  }

  // Deactivate all buttons
  const buttons = document.getElementsByClassName('tab-button');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove('active');
  }

  // Show the selected tab
  document.getElementById(tabId).classList.add('active');

  // Activate the clicked button
  event.currentTarget.classList.add('active');
}

// Export calendar data
function exportCalendar() {
  const data = autoScheduler.exportData();
  const dataStr = JSON.stringify(data);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

  const exportFileDefaultName = 'calendar-data.json';

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// Import calendar data
function importCalendar(fileInput) {
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        autoScheduler.importData(data);
        showStatusMessage('Calendar imported successfully!', 'success');
      } catch (error) {
        showStatusMessage('Error importing calendar: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  }
}

// Google Calendar import functions
function showGoogleCalendarImport() {
  document.getElementById('google-calendar-modal').style.display = 'block';
}

function hideGoogleCalendarImport() {
  document.getElementById('google-calendar-modal').style.display = 'none';
  document.getElementById('import-status').innerHTML = '';
}

async function importGoogleCalendar() {
  const urlInput = document.getElementById('google-calendar-url').value.trim();
  const daysRange = parseInt(document.getElementById('import-date-range').value);
  const statusEl = document.getElementById('import-status');

  if (!urlInput) {
    statusEl.innerHTML = '<div class="status-message status-error">Please enter a calendar URL or ID</div>';
    return;
  }

  statusEl.innerHTML = '<div class="status-message status-info">Importing calendar events...</div>';

  try {
    await autoScheduler.importGoogleCalendar(urlInput, daysRange);
    statusEl.innerHTML = '<div class="status-message status-success">Calendar imported successfully!</div>';

    setTimeout(() => {
      hideGoogleCalendarImport();
    }, 2000);
  } catch (error) {
    statusEl.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
  }
}

// --- ESTIMATION FUNCTION HELPERS ---

/**
 * Helper function to convert numeric time parts (like "1h" or "30m") to minutes.
 * @param {string} timeString - The duration string from the API, e.g., "2 hours 15 minutes".
 * @returns {number} The total duration in minutes.
 */
const timeToMinutes = (timeString) => {
  let minutes = 0;
  // Match digits followed by 'y', 'mo', 'w', 'd', 'h', 'm', or 's' (case-insensitive)
  const parts = timeString.match(/(\d+)\s*(y|mo|w|d|h|m|s)s?/gi);

  if (!parts) return 0;

  parts.forEach(part => {
    const match = part.match(/(\d+)\s*(y|mo|w|d|h|m|s)s?/i);
    if (!match) return;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'y': // 1 year = 365 days
        minutes += value * 525600;
        break;
      case 'mo': // 1 month = 30 days
        minutes += value * 43200;
        break;
      case 'w': // 1 week = 7 days
        minutes += value * 10080;
        break;
      case 'd': // 1 day = 24 hours (using 8 working hours for estimation)
        minutes += value * 480;
        break;
      case 'h': // 1 hour
        minutes += value * 60;
        break;
      case 'm': // 1 minute
        minutes += value;
        break;
      case 's': // 1 second (treating as 1 minute minimum for tasks)
        minutes += Math.max(value / 60, 1);
        break;
    }
  });
  return minutes;
};

/**
 * Helper function to convert vague duration terms to a sensible number of minutes
 * based on standard working time assumptions.
 * @param {string} vagueString - The vague duration string, e.g., "a few seconds".
 * @returns {number} The estimated duration in minutes.
 */
const vagueToMinutes = (vagueString) => {
  const str = vagueString.toLowerCase();
  if (str.includes('seconds') || str.includes('minute')) return 15; // Minimum task duration
  if (str.includes('hour')) return 60;
  if (str.includes('day')) return 480; // 8 working hours
  if (str.includes('week')) return 2400; // 40 working hours
  if (str.includes('month')) return 9600;
  if (str.includes('year')) return 115200;
  return 0;
};


/**
 * Calls the goblin.tools Estimator API to get a duration estimate
 * and updates the 'task-duration' input field.
 * @param {Event} event - The click event, used to prevent form submission.
 */
async function estimateDuriation(event) {
  // --- FIX: Prevent the form from submitting ---
  if (event) {
    event.preventDefault();
  }

  const taskNameInput = document.getElementById('task-name');
  const taskDurationInput = document.getElementById('task-duration');
  const taskText = taskNameInput ? taskNameInput.value.trim() : '';

  if (!taskText) {
    showStatusMessage("Please enter a task name to estimate its duration.", "error");
    return;
  }

  // Capture original state to restore later
  const originalValue = taskDurationInput.value;
  const originalPlaceholder = taskDurationInput.placeholder;

  // Set loading state using placeholder
  taskDurationInput.placeholder = 'Estimating...';
  taskDurationInput.value = '';
  taskDurationInput.disabled = true;

  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({
    "Text": taskText,
    "Ancestors": [],
    "Spiciness": 2,
    "Exact": true
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow"
  };

  try {
    const response = await fetch("https://goblin.tools/api/Estimator", requestOptions);
    
    // --- FIX: Read as text first to handle non-JSON error responses ---
    const resultText = await response.text();

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${resultText || 'Unknown error'}`);
    }

    let durationString = ''; // Initialize durationString

    // --- FIX: Check if the response is JSON or plain text ---
    if (resultText.trim().startsWith('{')) {
      // It looks like JSON, try to parse it
      try {
        const result = JSON.parse(resultText);
        durationString = result.Duration || '';
      } catch (jsonError) {
        console.error("Failed to parse API response as JSON:", resultText);
        throw new Error("API returned an invalid (but JSON-like) response.");
      }
    } else {
      // It's not JSON, assume it's the plain text duration
      durationString = resultText;
    }
    // --- End of fix ---

    console.log("Estimated Duration String:", durationString);

    let totalMinutes = 0;

    // 1. Check for ranges (e.g., "1 hour to 2 hours", "6 months to 1 year")
    if (durationString.includes(' to ')) {
      const [startStr, endStr] = durationString.split(' to ');
      const startMinutes = timeToMinutes(startStr);
      const endMinutes = timeToMinutes(endStr);
      totalMinutes = (startMinutes + endMinutes) / 2; // Use the average
    }
    // 2. Check for time units (e.g., "2 hours", "6 months")
    else if (durationString.match(/(\d+)\s*(y|mo|w|d|h|m|s)s?/i)) {
      totalMinutes = timeToMinutes(durationString);
    }
    // 3. Check for vague terms (e.g., "a few seconds", "a day")
    else {
      totalMinutes = vagueToMinutes(durationString);
    }

    // Finalize and update the input
    if (totalMinutes >= 1) {
      // Round minutes to the nearest 15 for compatibility with input step
      const roundedMinutes = Math.max(15, Math.round(totalMinutes / 15) * 15);
      taskDurationInput.value = roundedMinutes;
      console.log(`Updated duration to ${roundedMinutes} minutes.`);
    } else {
      taskDurationInput.value = originalValue;
      showStatusMessage(`Estimation returned unusable data: "${durationString}". Please enter manually.`, 'error');
    }

  } catch (error) {
    // Revert value on error
    taskDurationInput.value = originalValue;
    console.error("Error estimating duration:", error);
    showStatusMessage(`Failed to get estimate: ${error.message}`, 'error');
  } finally {
    // CLEANUP: Restore original state
    taskDurationInput.disabled = false;
    taskDurationInput.placeholder = originalPlaceholder;
  }
}

// Ensure the function is exposed globally for the HTML onclick handler
window.estimateDuriation = estimateDuriation;

/**
 * Utility function to show a non-blocking status message.
 * Creates a temporary element and fades it out.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'} type - The message type.
 */
function showStatusMessage(message, type = 'info') {
    // Check if a status container exists, if not, create one
    let statusContainer = document.getElementById('status-container');
    if (!statusContainer) {
        statusContainer = document.createElement('div');
        statusContainer.id = 'status-container';
        statusContainer.style.position = 'fixed';
        statusContainer.style.bottom = '20px';
        statusContainer.style.right = '20px';
        statusContainer.style.zIndex = '1000';
        document.body.appendChild(statusContainer);
    }

    const messageEl = document.createElement('div');
    messageEl.className = `status-message status-${type}`;
    messageEl.textContent = message;
    
    // Simple styling for the message
    messageEl.style.padding = '10px 20px';
    messageEl.style.margin = '5px 0';
    messageEl.style.borderRadius = '5px';
    messageEl.style.color = '#fff';
    messageEl.style.opacity = '1';
    messageEl.style.transition = 'opacity 0.5s ease-out';
    
    if (type === 'success') {
        messageEl.style.backgroundColor = 'green';
    } else if (type === 'error') {
        messageEl.style.backgroundColor = 'red';
    } else {
        messageEl.style.backgroundColor = 'blue';
    }

    statusContainer.appendChild(messageEl);

    // Fade out and remove
    setTimeout(() => {
        messageEl.style.opacity = '0';
        setTimeout(() => {
            messageEl.remove();
        }, 500); // Remove after fade out
    }, 3000); // Start fading after 3 seconds
}