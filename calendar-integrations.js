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
      const myHeaders = new Headers();
      myHeaders.append("Cookie", "NID=526=Iy8527m3f2TfmIiAJg8YLJc9M_d03rxSjq6efRKMKcqid6rXuqPhDSBx8dvIbJV0xbNxe8Gp9tFh8OgzPU7XZz6OlHkDoTkkm7n55Gi4oAOC9ihRC3GjrqYjS0LawBJOROsApFk2xLxckFqKQi5P4Qg2PKr25zQ15IQmQGN9G2fbYB7HvNcqNuqqo9JMG81aWn4BbjS4");
      
      const requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow"
      };

      const response = await fetch(calendarUrl, requestOptions);
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
        // Convert to calendar event format
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
        // Parse event properties
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
   * @param {string} dateStr - iCal date string (e.g., 20250126T140000Z)
   * @returns {Date} JavaScript Date object
   */
  parseICalDate(dateStr) {
    // Remove any timezone indicators for simplicity
    dateStr = dateStr.replace(/[TZ]/g, '');
    
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10)) || 0;
    const minute = parseInt(dateStr.substring(10, 12)) || 0;
    const second = parseInt(dateStr.substring(12, 14)) || 0;

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  /**
   * Break down a task using Goblin Tools API
   * @param {string} taskText - Task description to break down
   * @param {Array} ancestors - Parent tasks (optional)
   * @param {number} spiciness - Level of detail (1-5, default 2)
   * @param {boolean} exact - Whether to use exact matching
   * @returns {Promise<Object>} Task breakdown result
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

      const response = await fetch("https://goblin.tools/api/Estimator", requestOptions);
      const result = await response.text();
      
      console.log('Task breakdown result:', result);
      return JSON.parse(result);
      
    } catch (error) {
      console.error('Error breaking down task:', error);
      throw error;
    }
  }

  /**
   * Break down a task and add subtasks to calendar
   * @param {string} taskText - Main task description
   * @param {Object} taskOptions - Task options (priority, duration, deadline)
   * @param {number} spiciness - Level of breakdown detail
   * @returns {Promise<Array>} Created subtasks
   */
  async breakdownAndAddTask(taskText, taskOptions = {}, spiciness = 2) {
    try {
      // Get task breakdown
      const breakdown = await this.breakdownTask(taskText, [], spiciness);
      
      // Parse the breakdown result
      const subtasks = this.parseTaskBreakdown(breakdown);
      
      // Calculate duration per subtask
      const totalDuration = taskOptions.duration || this.calendar.settings.defaultTaskDuration;
      const durationPerSubtask = Math.ceil(totalDuration / subtasks.length);
      
      // Add each subtask to the calendar
      const addedTasks = [];
      subtasks.forEach((subtask, index) => {
        const task = this.calendar.addTask({
          name: `${taskText} - ${subtask}`,
          priority: taskOptions.priority || 5,
          duration: durationPerSubtask,
          deadline: taskOptions.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        addedTasks.push(task);
      });
      
      console.log(`Added ${addedTasks.length} subtasks for: ${taskText}`);
      return addedTasks;
      
    } catch (error) {
      console.error('Error breaking down and adding task:', error);
      throw error;
    }
  }

  /**
   * Parse task breakdown result into subtask array
   * @param {string|Object} breakdown - Raw breakdown result
   * @returns {Array<string>} Array of subtask descriptions
   */
  parseTaskBreakdown(breakdown) {
    // If breakdown is a string, try to parse it
    if (typeof breakdown === 'string') {
      try {
        breakdown = JSON.parse(breakdown);
      } catch (e) {
        // If parsing fails, split by newlines
        return breakdown.split('\n').filter(line => line.trim());
      }
    }
    
    // Handle different response formats
    if (Array.isArray(breakdown)) {
      return breakdown;
    } else if (breakdown.subtasks) {
      return breakdown.subtasks;
    } else if (breakdown.steps) {
      return breakdown.steps;
    }
    
    // Fallback: return as single item array
    return [breakdown.toString()];
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalendarIntegrations;
}
