/**
 * Calendar Integrations Module
 * Handles Google Calendar import and Goblin Tools task breakdown
 */

class CalendarIntegrations {
  constructor(calendarInstance) {
    this.calendar = calendarInstance;
  }

  /**
   * Fetch and parse Google Calendar iCal feed
   * @param {string} calendarUrl - iCal URL from Google Calendar
   * @returns {Promise<Array>} Parsed events
   */
  async importGoogleCalendar(calendarUrl) {
    try {
      // Google Calendar blocks direct browser access (CORS).
      // We use a proxy to get around this for the prototype.
      const proxyUrl = "https://corsproxy.io/?";
      const targetUrl = proxyUrl + encodeURIComponent(calendarUrl);

      const requestOptions = {
        method: "GET",
        redirect: "follow"
      };

      const response = await fetch(targetUrl, requestOptions);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
      }
      
      const icalData = await response.text();
      
      // Parse iCal data
      const events = this.parseICalData(icalData);
      
      // Add events to calendar
      events.forEach(event => {
        this.calendar.addEvent(event);
      });
      
      console.log(`Imported ${events.length} events from Google Calendar`);
      return events;
      
    } catch (error) {
      console.error('Error importing Google Calendar:', error);
      alert('Failed to import Google Calendar. Ensure the link is a public iCal link.');
      throw error;
    }
  }

  /**
   * Parse iCal format data into event objects
   * @param {string} icalData - iCal formatted string
   * @returns {Array} Array of event objects
   */
  parseICalData(icalData) {
    const events = [];
    const lines = icalData.split('\n');
    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (line === 'END:VEVENT' && currentEvent) {
        if (currentEvent.start && currentEvent.end && currentEvent.summary) {
          events.push({
            name: currentEvent.summary,
            start: currentEvent.start,
            end: currentEvent.end,
            description: currentEvent.description || '',
            location: currentEvent.location || ''
          });
        }
        currentEvent = null;
      } else if (currentEvent) {
        if (line.startsWith('SUMMARY:')) {
          currentEvent.summary = line.substring(8);
        } else if (line.startsWith('DTSTART')) {
          const dateStr = line.split(':')[1];
          currentEvent.start = this.parseICalDate(dateStr);
        } else if (line.startsWith('DTEND')) {
          const dateStr = line.split(':')[1];
          currentEvent.end = this.parseICalDate(dateStr);
        } else if (line.startsWith('DESCRIPTION:')) {
          currentEvent.description = line.substring(12);
        } else if (line.startsWith('LOCATION:')) {
          currentEvent.location = line.substring(9);
        }
      }
    }
    return events;
  }

  /**
   * Parse iCal date format to JavaScript Date
   */
  parseICalDate(dateStr) {
    if (!dateStr) return new Date();
    dateStr = dateStr.replace(/[TZ]/g, '');
    
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10)) || 0;
    const minute = parseInt(dateStr.substring(10, 12)) || 0;
    const second = parseInt(dateStr.substring(12, 14)) || 0;

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  /**
   * Get a duration estimate using Goblin Tools Estimator API
   */
  async breakdownTask(taskText, ancestors = [], spiciness = 2, exact = false) {
    try {
      const myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");

      const raw = JSON.stringify({
        "Text": taskText,
        "Ancestors": ancestors,
        "Spiciness": spiciness,
        "Exact": exact
      });

      const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
      };

      // URL set to Estimator as requested
      const response = await fetch("https://goblin.tools/api/Estimator", requestOptions);
      const result = await response.text();
      
      console.log('Task estimate result:', result);
      
      // Estimator returns a plain string (e.g., "2 hours").
      // We try to parse as JSON just in case, but usually return the text.
      try {
        return JSON.parse(result);
      } catch (e) {
        return result; // Return the plain text estimate
      }
      
    } catch (error) {
      console.error('Error fetching estimate:', error);
      throw error;
    }
  }

  /**
   * This function normally breaks down tasks, but with Estimator it will 
   * add a single "subtask" containing the time estimate string.
   */
  async breakdownAndAddTask(taskText, taskOptions = {}, spiciness = 2) {
    try {
      // Get task estimate (returns a string like "2 hours")
      const estimate = await this.breakdownTask(taskText, [], spiciness);
      
      // Handle the result as a list containing the estimate string
      const subtasks = this.parseTaskBreakdown(estimate);
      
      // Calculate duration per subtask (defaults to settings if not provided)
      const totalDuration = taskOptions.duration || this.calendar.settings.defaultTaskDuration;
      
      const addedTasks = [];
      subtasks.forEach((subtask) => {
        // Ensure the content is a string
        const infoString = typeof subtask === 'string' ? subtask : JSON.stringify(subtask);
        
        const task = this.calendar.addTask({
          name: `${taskText} - Est: ${infoString}`, // Appends estimate to name
          priority: taskOptions.priority || 5,
          duration: totalDuration, 
          deadline: taskOptions.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        addedTasks.push(task);
      });
      
      console.log(`Added estimate info for: ${taskText}`);
      return addedTasks;
      
    } catch (error) {
      console.error('Error getting estimate:', error);
      throw error;
    }
  }

  /**
   * Helper to ensure we return an array, even for a single string string
   */
  parseTaskBreakdown(breakdown) {
    if (Array.isArray(breakdown)) return breakdown;
    
    // If it's a string (which Estimator returns), wrap it in an array
    if (typeof breakdown === 'string') {
        // Check if it's actually a JSON string we missed
        try {
            const parsed = JSON.parse(breakdown);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            // It's just a plain text string
            return [breakdown];
        }
    }
    return [String(breakdown)];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalendarIntegrations;
}
