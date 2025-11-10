/**
 * Auto-Scheduling Calendar
 * This script handles calendar management and automatic task scheduling
 */

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
            isScheduled: false
          });
          
          // Auto-schedule after adding a new task
          this.autoScheduleTasks();
          this.renderCalendar();
          
          // Reset form
          taskForm.reset();
        });
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
      const dateKey = event.start.toDateString();
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push(event);
    });
    
    // Create calendar view
    Object.keys(eventsByDate).forEach(dateKey => {
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
        throw new Error(`No events found in the next ${daysAhead} days. Try a longer date range or check if the calendar has events.`);
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
    const lines = icalData.split(/\r?\n/);
    
    let currentEvent = null;
    let currentProperty = '';
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Handle line continuation (lines starting with space or tab)
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
        i++;
        line += lines[i].trim();
      }
      
      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent) {
        // Only add events within the date range
        if (currentEvent.start && currentEvent.end) {
          if (currentEvent.start <= endDate && currentEvent.end >= startDate) {
            events.push(currentEvent);
          }
        }
        currentEvent = null;
      } else if (currentEvent) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const property = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);
          
          // Parse different properties
          if (property.startsWith('DTSTART')) {
            currentEvent.start = this.parseICalDate(value);
          } else if (property.startsWith('DTEND')) {
            currentEvent.end = this.parseICalDate(value);
          } else if (property === 'SUMMARY') {
            currentEvent.summary = value;
          } else if (property === 'DESCRIPTION') {
            currentEvent.description = value;
          } else if (property === 'LOCATION') {
            currentEvent.location = value;
          }
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