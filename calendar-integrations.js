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
   */
  async importGoogleCalendar(calendarUrl) {
    try {
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
      const events = this.parseICalData(icalData);
      
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
   * Parse iCal date format
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
   * This is the dedicated tool for automatic estimation.
   */
  async getEstimate(taskText, spiciness = 2) {
    try {
      const myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");

      const raw = JSON.stringify({
        "Text": taskText,
        "Ancestors": [],
        "Spiciness": spiciness,
        "Exact": false
      });

      const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
      };

      const response = await fetch("https://goblin.tools/api/Estimator", requestOptions);
      const result = await response.text();
      
      console.log(`Estimate fetched for "${taskText}":`, result);
      
      // Attempt to clean up JSON quotes if present, otherwise return raw text
      try {
        return JSON.parse(result);
      } catch (e) {
        return result;
      }
      
    } catch (error) {
      console.error('Error fetching estimate:', error);
      return null;
    }
  }

  /**
   * Break down a task (Legacy/Manual support)
   */
  async breakdownAndAddTask(taskText, taskOptions = {}, spiciness = 2) {
    // This can reuse getEstimate or implement specific subtask logic
    // For now, we keep it focused on the previous requirement if needed,
    // or you can map it to getEstimate if you prefer.
    try {
        const estimate = await this.getEstimate(taskText, spiciness);
        const task = this.calendar.addTask({
            name: `${taskText} - (Est: ${estimate})`,
            priority: taskOptions.priority || 5,
            duration: taskOptions.duration || 60,
            deadline: taskOptions.deadline
        });
        return [task];
    } catch (error) {
        console.error("Error in breakdownAndAddTask:", error);
        throw error;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalendarIntegrations;
}
