/**
 * Auto-Scheduling Calendar
 * This script handles calendar management, commute times, and AI task estimation.
 */

// --- Utility Functions (moved from index.html) ---
const showLoader = (show) => {
    const loader = document.getElementById('loading-spinner');
    if (loader) loader.style.display = show ? 'block' : 'none';
};

const showMessage = (message, type = 'success') => {
    const messageArea = document.getElementById('message-area');
    if (messageArea) {
        messageArea.textContent = message;
        messageArea.className = type; // 'success' or 'error'
        setTimeout(() => {
            messageArea.className = '';
        }, 5000);
    }
};

// --- Cookie Utilities ---
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    // Set SameSite=Lax for security and modern browser compatibility
    // Use encodeURIComponent to handle special characters in JSON
    document.cookie = name + "=" + (encodeURIComponent(value || "")) + expires + "; path=/; SameSite=Lax";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i=0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}
// --- End Cookie Utilities ---


class Calendar {
  constructor() {
    this.events = []; // All events (fixed, task, commute)
    this.tasks = []; // Master list of tasks
    this.settings = {
      workingHours: { start: 9, end: 17 },
      workDays: [1, 2, 3, 4, 5],
      defaultTaskDuration: 60,
      minBreakBetweenTasks: 15,
      orsApiKey: null, // New
      homeAddress: null, // New
    };
    
    // Bind methods
    this.addTask = this.addTask.bind(this);
    this.addEvent = this.addEvent.bind(this);
    this.autoScheduleTasks = this.autoScheduleTasks.bind(this);
    this.getAvailableSlots = this.getAvailableSlots.bind(this);
    this.renderCalendar = this.renderCalendar.bind(this);
    this.fetchICS = this.fetchICS.bind(this);
    this.saveSettings = this.saveSettings.bind(this);
    this.getCoordinates = this.getCoordinates.bind(this);
    this.getCommuteTime = this.getCommuteTime.bind(this);
    this.estimateTaskDuration = this.estimateTaskDuration.bind(this);
    this.saveData = this.saveData.bind(this); // <-- ADDED
    this.loadData = this.loadData.bind(this); // <-- ADDED
    
    // Load settings from cookie
    this.loadSettings();
    // Load events and tasks from cookie
    this.loadData(); // <-- ADDED
    
    // Initialize
    this.initCalendar();
  }

  /**
   * Initialize calendar UI and event listeners
   */
  initCalendar() {
    document.addEventListener('DOMContentLoaded', () => {
      // Task form submission
      const taskForm = document.getElementById('task-form');
      if (taskForm) {
        taskForm.addEventListener('submit', async (e) => { // Now async
          e.preventDefault();
          showLoader(true);
          
          const taskData = {
            name: document.getElementById('task-name').value,
            priority: parseInt(document.getElementById('task-priority').value),
            duration: parseInt(document.getElementById('task-duration').value),
            deadline: new Date(document.getElementById('task-deadline').value),
            location: document.getElementById('task-location').value || null,
            isScheduled: false
          };
          
          await this.addTask(taskData); // Await the async add
          this.autoScheduleTasks(); // This will also save data
          this.renderCalendar();
          
          taskForm.reset();
          showLoader(false);
          showMessage('Task added and schedule updated.');
        });
      }
      
      // Event form submission
      const eventForm = document.getElementById('event-form');
      if (eventForm) {
        eventForm.addEventListener('submit', async (e) => { // Now async
          e.preventDefault();
          showLoader(true);
          
          const eventData = {
            name: document.getElementById('event-name').value,
            start: new Date(document.getElementById('event-start').value),
            end: new Date(document.getElementById('event-end').value),
            location: document.getElementById('event-location').value || null,
            isFixed: true
          };
          
          await this.addEvent(eventData); // Await the async add
          this.autoScheduleTasks(); // This will also save data
          this.renderCalendar();
          
          eventForm.reset();
          showLoader(false);
          showMessage('Event added and schedule updated.');
        });
      }
      
      // Initial render
      this.renderCalendar();
    });
  }
  
  // --- Settings Management ---
  
  saveSettings(settings) {
    this.settings.orsApiKey = settings.orsApiKey;
    this.settings.homeAddress = settings.homeAddress;
    this.settings.workingHours.start = parseInt(settings.workStart.split(':')[0]);
    this.settings.workingHours.end = parseInt(settings.workEnd.split(':')[0]);
    this.settings.workDays = settings.workDays;
    this.settings.minBreakBetweenTasks = settings.minBreak;
    this.settings.defaultTaskDuration = settings.defaultDuration;
    
    // Save to cookie
    setCookie('calendarSettings', JSON.stringify(this.settings), 365); // <-- CHANGED
    console.log('Settings saved:', this.settings);
  }
  
  loadSettings() {
    const savedSettings = getCookie('calendarSettings'); // <-- CHANGED
    if (savedSettings) {
        try {
            this.settings = JSON.parse(savedSettings);
            console.log('Settings loaded:', this.settings);
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
  }

  // --- NEW Data Save/Load Methods ---
  saveData() {
    try {
      // Note: Cookies have size limits (e.g., 4KB). This might fail for large lists.
      const eventsData = JSON.stringify(this.events);
      const tasksData = JSON.stringify(this.tasks);
      
      setCookie('calendarEvents', eventsData, 365);
      setCookie('calendarTasks', tasksData, 365);
      console.log('Task and Event data saved to cookies.');
    } catch (e) {
      console.error('Error saving data to cookies:', e);
      showMessage('Error saving data. Cookie size limit may be exceeded.', 'error');
    }
  }
  
  loadData() {
    const eventsData = getCookie('calendarEvents');
    if (eventsData) {
        try {
            this.events = JSON.parse(eventsData).map(e => ({
                ...e,
                start: new Date(e.start),
                end: new Date(e.end)
            }));
            console.log('Events loaded from cookie.');
        } catch (e) {
            console.error('Error loading events from cookie:', e);
            this.events = [];
        }
    }
    
    const tasksData = getCookie('calendarTasks');
    if (tasksData) {
        try {
            this.tasks = JSON.parse(tasksData).map(t => ({
                ...t,
                deadline: new Date(t.deadline),
                scheduledStart: t.scheduledStart ? new Date(t.scheduledStart) : null,
                scheduledEnd: t.scheduledEnd ? new Date(t.scheduledEnd) : null,
            }));
            console.log('Tasks loaded from cookie.');
        } catch (e) {
            console.error('Error loading tasks from cookie:', e);
            this.tasks = [];
        }
    }
  }
  // --- End Data Save/Load Methods ---

  // --- Core Task/Event Methods ---

  /**
   * Add a task to be scheduled
   * @param {Object} task - Task to add
   */
  async addTask(task) {
    const newTask = {
      id: this.generateId(),
      name: task.name,
      priority: task.priority || 1,
      duration: task.duration || this.settings.defaultTaskDuration,
      deadline: task.deadline,
      location: task.location,
      isScheduled: false,
      scheduledStart: null,
      scheduledEnd: null,
      commuteToDuration: 0,
      commuteFromDuration: 0
    };
    
    // Calculate commute times if location is provided
    if (newTask.location && this.settings.homeAddress && this.settings.orsApiKey) {
        try {
            console.log(`Calculating commutes for task: ${newTask.name}`);
            newTask.commuteToDuration = await this.getCommuteTime(this.settings.homeAddress, newTask.location);
            newTask.commuteFromDuration = await this.getCommuteTime(newTask.location, this.settings.homeAddress);
            console.log(`Commutes: To ${newTask.commuteToDuration}m, From ${newTask.commuteFromDuration}m`);
        } catch (error) {
            showMessage(`Error calculating commute for task: ${error.message}`, 'error');
        }
    }
    
    this.tasks.push(newTask);
    // this.saveData(); // <-- No longer needed here, will be called by autoScheduleTasks
    console.log(`Task added: ${newTask.name}`);
    return newTask;
  }

  /**
   * Add a fixed event (and its commutes)
   * @param {Object} event - Event to add
   */
  async addEvent(event) {
    // Add the main event
    const newEvent = {
      id: this.generateId(),
      name: event.name,
      start: event.start,
      end: event.end,
      location: event.location,
      isFixed: true
    };
    this.events.push(newEvent);
    console.log(`Event added: ${newEvent.name}`);
    
    // Add commute events if location is provided
    if (newEvent.location && this.settings.homeAddress && this.settings.orsApiKey) {
        try {
            console.log(`Calculating commutes for event: ${newEvent.name}`);
            const commuteToDuration = await this.getCommuteTime(this.settings.homeAddress, newEvent.location);
            const commuteFromDuration = await this.getCommuteTime(newEvent.location, this.settings.homeAddress);
            
            if (commuteToDuration > 0) {
                this.events.push({
                    id: this.generateId(),
                    name: `Commute to ${newEvent.name}`,
                    start: new Date(newEvent.start.getTime() - commuteToDuration * 60000),
                    end: newEvent.start,
                    isFixed: true,
                    isCommute: true
                });
            }
            
            if (commuteFromDuration > 0) {
                 this.events.push({
                    id: this.generateId(),
                    name: `Commute from ${newEvent.name}`,
                    start: newEvent.end,
                    end: new Date(newEvent.end.getTime() + commuteFromDuration * 60000),
                    isFixed: true,
                    isCommute: true
                });
            }
        } catch (error) {
            showMessage(`Error calculating commute for event: ${error.message}`, 'error');
        }
    }
    
    // this.saveData(); // <-- No longer needed here, will be called by autoScheduleTasks
    return newEvent;
  }

  // --- Scheduling Engine ---

  /**
   * Automatically schedule all unscheduled tasks
   */
  autoScheduleTasks() {
    // Reset all tasks and remove old task/commute events from the main list
    this.tasks.forEach(task => {
        task.isScheduled = false;
        task.scheduledStart = null;
        task.scheduledEnd = null;
    });
    this.events = this.events.filter(event => event.isFixed); // Keep only fixed events

    // Sort tasks by priority (highest first) and deadline (earliest first)
    const taskQueue = [...this.tasks].sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.deadline - b.deadline;
    });

    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const availableSlots = this.getAvailableSlots(now, twoWeeksFromNow);

    // Schedule each task
    taskQueue.forEach(task => {
        const totalDuration = task.duration + task.commuteToDuration + task.commuteFromDuration;
        
        for (let i = 0; i < availableSlots.length; i++) {
            const slot = availableSlots[i];
            const slotDuration = (slot.end - slot.start) / 60000; // in minutes

            // Find a suitable slot
            if (slotDuration >= totalDuration) {
                // This slot works!
                let currentTime = new Date(slot.start.getTime());
                
                // 1. Add "Commute To" event
                if (task.commuteToDuration > 0) {
                    const commuteEnd = new Date(currentTime.getTime() + task.commuteToDuration * 60000);
                    this.events.push({
                        id: this.generateId(),
                        name: `Commute to ${task.name}`,
                        start: currentTime,
                        end: commuteEnd,
                        isFixed: false, isTask: false, isCommute: true
                    });
                    currentTime = commuteEnd; // Advance time
                }
                
                // 2. Add Task event
                task.scheduledStart = new Date(currentTime.getTime());
                task.scheduledEnd = new Date(task.scheduledStart.getTime() + task.duration * 60000);
                task.isScheduled = true;
                
                this.events.push({
                    id: task.id,
                    name: task.name,
                    start: task.scheduledStart,
                    end: task.scheduledEnd,
                    isFixed: false, isTask: true, isCommute: false,
                    taskId: task.id
                });
                
                currentTime = task.scheduledEnd; // Advance time
                
                // 3. Add "Commute From" event
                if (task.commuteFromDuration > 0) {
                    const commuteEnd = new Date(currentTime.getTime() + task.commuteFromDuration * 60000);
                     this.events.push({
                        id: this.generateId(),
                        name: `Commute from ${task.name}`,
                        start: currentTime,
                        end: commuteEnd,
                        isFixed: false, isTask: false, isCommute: true
                    });
                    currentTime = commuteEnd; // Advance time
                }

                // Update the available slot (add break time)
                slot.start = new Date(currentTime.getTime() + this.settings.minBreakBetweenTasks * 60000);
                
                break; // Task scheduled, move to next task
            }
        }

        if (!task.isScheduled) {
            console.warn(`Could not schedule task: ${task.name}`);
        }
    });

    this.saveData(); // <-- ADDED: Save all changes after scheduling
    console.log(`Scheduled ${this.tasks.filter(t => t.isScheduled).length} out of ${this.tasks.length} tasks`);
  }

  /**
   * Get available time slots between start and end dates
   */
  getAvailableSlots(startDate, endDate) {
    const slots = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    
    // Get all fixed events (manual + commute)
    const fixedEvents = this.events.filter(event => event.isFixed);
    
    while (currentDate < endDate) {
      const dayOfWeek = currentDate.getDay();
      
      if (this.settings.workDays.includes(dayOfWeek)) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(this.settings.workingHours.start, 0, 0, 0);
        
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(this.settings.workingHours.end, 0, 0, 0);
        
        const effectiveStart = startDate > dayStart ? startDate : dayStart;
        
        if (effectiveStart < dayEnd) {
          const dayEvents = fixedEvents.filter(event => {
            return event.start < dayEnd && event.end > effectiveStart;
          }).sort((a, b) => a.start - b.start);
          
          let timePointer = new Date(effectiveStart);
          
          dayEvents.forEach(event => {
            if (timePointer < event.start) {
              slots.push({ start: new Date(timePointer), end: new Date(event.start) });
            }
            timePointer = new Date(Math.max(timePointer.getTime(), event.end.getTime()));
          });
          
          if (timePointer < dayEnd) {
            slots.push({ start: new Date(timePointer), end: new Date(dayEnd) });
          }
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }
    
    // Filter out slots that are too short for *any* task
    return slots.filter(slot => {
      const durationMinutes = (slot.end - slot.start) / 60000;
      return durationMinutes >= (this.settings.minBreakBetweenTasks + 15); // At least 15 min task + break
    });
  }

  // --- API Methods (ORS and Gemini) ---

  /**
   * Get [longitude, latitude] for a given address
   * @param {string} address - The address to geocode
   * @returns {Array} [longitude, latitude]
   */
  async getCoordinates(address) {
    if (!this.settings.orsApiKey) throw new Error('ORS API key is not set.');
    
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${this.settings.orsApiKey}&text=${encodeURIComponent(address)}&size=1`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding API error: ${response.statusText}`);
    
    const data = await response.json();
    if (!data.features || data.features.length === 0) throw new Error('Address not found.');
    
    return data.features[0].geometry.coordinates; // [lng, lat]
  }

  /**
   * Get commute time in minutes between two addresses
   * @param {string} startAddress - Starting address
   * @param {string} endAddress - Ending address
   * @returns {number} Commute time in minutes
   */
  async getCommuteTime(startAddress, endAddress) {
    if (!this.settings.orsApiKey) throw new Error('ORS API key is not set.');
    
    showLoader(true);
    try {
        const startCoords = await this.getCoordinates(startAddress);
        const endCoords = await this.getCoordinates(endAddress);
        
        const url = `https://api.openrouteservice.org/v2/directions/driving-car`;
        const body = JSON.stringify({ "coordinates": [startCoords, endCoords] });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.settings.orsApiKey,
                'Content-Type': 'application/json'
            },
            body: body
        });
        
        if (!response.ok) throw new Error(`Directions API error: ${response.statusText}`);
        
        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error('Route not found.');
        
        const durationInSeconds = data.routes[0].summary.duration;
        return Math.round(durationInSeconds / 60); // Return minutes
        
    } catch (error) {
        console.error('getCommuteTime error:', error);
        showMessage(error.message, 'error');
        return 0; // Default to 0 on error
    } finally {
        showLoader(false);
    }
  }
  
  // --- NEW HELPER FUNCTION ---
  /**
   * Helper to parse a duration string (e.g., "1-2 hours", "30 minutes", "a few minutes") into minutes
   * @param {string} durationString - The string to parse
   * @returns {number} Estimated duration in minutes
   */
  parseDurationString(durationString) {
    if (!durationString) return null;

    let totalMinutes = 0;
    const lowerStr = durationString.toLowerCase();

    // --- HANDLE VAGUE CASES ---
    if (lowerStr.includes("a few minutes") || lowerStr.includes("a minute")) {
        return 15; // Set a minimum of 15
    }
    
    // Ignore impractical durations for daily scheduling
    if (lowerStr.includes("month") || lowerStr.includes("year")) {
        console.warn(`Ignoring impractical duration: ${durationString}`);
        return null; 
    }
    // --- END VAGUE CASES ---
    
    // Find numbers (can be ranges like 1-2 or 10-15)
    const numbers = (lowerStr.match(/[\d\.]+/g) || []).map(Number);
    if (numbers.length === 0) return null; // No numbers found
    
    // Take the average of the first two numbers if it's a range (e.g., "1-2 hours" -> 1.5)
    const num = numbers.length > 1 ? (numbers[0] + numbers[1]) / 2 : numbers[0];

    // Check for units
    if (lowerStr.includes('week')) {
        totalMinutes = num * 5 * 8 * 60; // Assume 5-day, 8-hr/day work week
    } else if (lowerStr.includes('day')) {
        totalMinutes = num * 8 * 60; // Assume 8-hour work day
    } else if (lowerStr.includes('hour') || lowerStr.includes('hr')) {
        totalMinutes = num * 60;
    } else {
        // Default to minutes if 'minute' or no unit is specified
        totalMinutes = num;
    }

    // Round to nearest 15-minute increment, with a 15-min minimum
    const rounded = Math.max(15, Math.ceil(totalMinutes / 15) * 15);
    return rounded;
  }
  // --- END NEW HELPER FUNCTION ---

  /**
   * Estimate task duration using Goblin.tools API
   * @param {string} taskName - The name of the task
   * @returns {number} Estimated duration in minutes
   */
  /**
   * Estimate task duration using Goblin.tools API
   * @param {string} taskName - The name of the task
   * @returns {number} Estimated duration in minutes
   */
  async estimateTaskDuration(taskName) {
    const apiUrl = "https://goblin.tools/api/Estimator";
    
    const raw = JSON.stringify({
      "Text": taskName,
      "Ancestors": [],
      "Spiciness": 2, // A neutral "spiciness" level
      "Exact": true,
    });
    
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
      redirect: "follow"
    };

    try {
        const response = await fetch(apiUrl, requestOptions);

        if (!response.ok) {
            throw new Error(`Goblin API error: ${response.status} ${response.statusText}`);
        }
        
        // --- THIS IS THE FIX ---
        // The API returns plain text, not JSON
        const durationString = await response.text(); 
        // We remove the quotes that the API adds, e.g., "about 1-2 hours" -> about 1-2 hours
        const cleanedString = durationString.replace(/"/g, ''); 
        
        if (cleanedString) {
            const duration = this.parseDurationString(cleanedString);
            if (duration) {
                return duration;
            }
        }
        // --- END OF FIX ---

        throw new Error('Could not parse duration from API response.');
        
    } catch (error) {
        console.error('estimateTaskDuration error:', error);
        // This will catch network errors and potential CORS errors
        showMessage(error.message, 'error');
        return null;
    }
  }

  // --- .ics Importer ---

  async fetchICS(url) {
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const fetchUrl = proxyUrl + encodeURIComponent(url);
    
    showLoader(true);
    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`CORS proxy error: ${response.status}`);
        
        const icsData = await response.text();
        const events = this.parseICS(icsData);
        
        let addedCount = 0;
        for (const event of events) {
            const exists = this.events.some(e => 
                e.name === event.name && e.start.getTime() === event.start.getTime()
            );
            if (!exists) {
                // Use addEvent to handle commutes if location data exists (though rare in .ics)
                await this.addEvent(event); 
                addedCount++;
            }
        }
        
        this.autoScheduleTasks(); // This will also save data
        this.renderCalendar();
        showMessage(`Imported ${addedCount} new events.`);
        
    } catch (error) {
        console.error('Error fetching .ics file:', error);
        showMessage(`Error fetching .ics: ${error.message}`, 'error');
    } finally {
        showLoader(false);
    }
  }
  
  parseICS(data) {
    const events = [];
    const eventBlocks = data.split('BEGIN:VEVENT');
    
    eventBlocks.slice(1).forEach(block => {
        if (block.includes('END:VEVENT')) {
            const event = { isFixed: true }; // All imported events are fixed
            
            const summaryMatch = block.match(/SUMMARY:(.*)/);
            if (summaryMatch) event.name = summaryMatch[1].trim();
            
            const startMatch = block.match(/DTSTART(?:;.*)?:(.*)/);
            if (startMatch) event.start = this.parseICSTime(startMatch[1].trim());
            
            const endMatch = block.match(/DTEND(?:;.*)?:(.*)/);
            if (endMatch) event.end = this.parseICSTime(endMatch[1].trim());
            
            const locationMatch = block.match(/LOCATION:(.*)/);
            if (locationMatch) event.location = locationMatch[1].trim();

            if (event.name && event.start && event.end) {
                events.push(event);
            }
        }
    });
    return events;
  }
  
  parseICSTime(dtString) {
    try {
        if (dtString.includes('T') && dtString.endsWith('Z')) {
            const [date, time] = dtString.split('T');
            return new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`);
        }
        else if (dtString.includes('T')) {
            const [date, time] = dtString.split('T');
            return new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`);
        }
        else if (dtString.length === 8) {
            return new Date(`${dtString.slice(0, 4)}-${dtString.slice(4, 6)}-${dtString.slice(6, 8)}`);
        }
        return new Date(dtString);
    } catch (e) {
        console.error("Could not parse ICS date:", dtString);
        return null;
    }
  }

  // --- UI Rendering ---

  renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    calendarEl.innerHTML = '';
    
    // Get all events (fixed, scheduled tasks, scheduled commutes)
    const allEvents = [...this.events].sort((a, b) => a.start - b.start);
    
    const eventsByDate = {};
    allEvents.forEach(event => {
      if (!event.start || !(event.start instanceof Date) || isNaN(event.start)) {
          console.warn("Skipping event with invalid start date:", event);
          return;
      }
      const dateKey = event.start.toDateString();
      if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
      eventsByDate[dateKey].push(event);
    });
    
    // Render sorted dates
    Object.keys(eventsByDate).sort((a, b) => new Date(a) - new Date(b)).forEach(dateKey => {
      const dateEvents = eventsByDate[dateKey];
      
      const dateHeader = document.createElement('h3');
      dateHeader.textContent = dateKey;
      calendarEl.appendChild(dateHeader);
      
      const eventsList = document.createElement('ul');
      eventsList.className = 'events-list';
      
      dateEvents.forEach(event => {
        const eventItem = document.createElement('li');
        
        let badge = '';
        if (event.isCommute) {
            eventItem.className = 'commute-event';
            badge = '<span class="event-badge commute-badge">Commute</span>';
        } else if (event.isTask) {
            eventItem.className = 'task-event';
            badge = '<span class="event-badge">Task</span>';
        } else {
            eventItem.className = 'fixed-event';
        }
        
        const startTime = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        eventItem.innerHTML = `
          <span class="event-time">${startTime} - ${endTime}</span>
          <span class="event-name">${event.name}</span>
          ${badge}
        `;
        
        eventsList.appendChild(eventItem);
      });
      
      calendarEl.appendChild(eventsList);
    });
    
    // Render unscheduled tasks
    const unscheduledTasks = this.tasks.filter(task => !task.isScheduled);
    if (unscheduledTasks.length > 0) {
      const unscheduledHeader = document.createElement('h3');
      unscheduledHeader.textContent = 'Unscheduled Tasks';
      calendarEl.appendChild(unscheduledHeader);
      
      const tasksList = document.createElement('ul');
      tasksList.className = 'unscheduled-tasks';
      
      unscheduledTasks.forEach(task => {
        const taskItem = document.createElement('li');
        let details = `Priority: ${task.priority}, Duration: ${task.duration} mins, Deadline: ${task.deadline.toLocaleDateString()}`;
        if (task.commuteToDuration > 0) {
            details += `, Commute: ${task.commuteToDuration + task.commuteFromDuration} mins`;
        }
        taskItem.innerHTML = `
          <span class="task-name">${task.name}</span>
          <span class="task-details">${details}</span>
        `;
        tasksList.appendChild(taskItem);
      });
      
      calendarEl.appendChild(tasksList);
    }
  }

  // --- Utilities ---

  generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }
  
  exportData() {
    return {
      events: this.events,
      tasks: this.tasks,
      settings: this.settings
    };
  }
  
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
        scheduledEnd: t.scheduledEnd ? new Date(t.scheduledEnd) : null,
    }));
    if (data.settings) this.settings = data.settings;
    
    this.renderCalendar();
    this.saveData(); // <-- ADDED: Save imported data
  }
}

// Initialize the calendar
const autoScheduler = new Calendar();

// Export to global scope for browser console access
window.autoScheduler = autoScheduler;