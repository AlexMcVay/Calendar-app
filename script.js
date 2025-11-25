/**
 * Auto-Scheduling Calendar
 * This script handles calendar management and automatic task scheduling
 */

class Calendar {
  constructor() {
    this.events = [];
    this.tasks = [];
    this.integrations = null; // Store reference to integrations
    this.settings = {
      workingHours: {
        start: 9, // 9 AM
        end: 17, // 5 PM
      },
      workDays: [1, 2, 3, 4, 5], // Monday to Friday
      defaultTaskDuration: 60, // minutes
      minBreakBetweenTasks: 15, // minutes
    };
    
    // Bind methods
    this.addTask = this.addTask.bind(this);
    this.addEvent = this.addEvent.bind(this);
    this.autoScheduleTasks = this.autoScheduleTasks.bind(this);
    this.getAvailableSlots = this.getAvailableSlots.bind(this);
    this.renderCalendar = this.renderCalendar.bind(this);
    
    // Initialize
    this.initCalendar();
  }

  /**
   * Link the integrations module to the calendar
   */
  setIntegrations(integrationsInstance) {
    this.integrations = integrationsInstance;
    console.log("Integrations module connected.");
  }

  /**
   * Initialize calendar UI and event listeners
   */
  initCalendar() {
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
          
          this.autoScheduleTasks();
          this.renderCalendar();
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
          
          this.autoScheduleTasks();
          this.renderCalendar();
          eventForm.reset();
        });
      }
      
      this.renderCalendar();
    });
  }

  /**
   * Add a task and automatically fetch estimate
   */
  addTask(task) {
    const newTask = {
      id: this.generateId(),
      name: task.name,
      priority: task.priority || 1,
      duration: task.duration || this.settings.defaultTaskDuration,
      deadline: task.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isScheduled: false,
      scheduledStart: null,
      scheduledEnd: null,
      aiEstimate: null // Placeholder for the estimate
    };
    
    this.tasks.push(newTask);
    console.log(`Task added: ${newTask.name}`);

    // AUTOMATICALLY RUN ESTIMATOR TOOL
    if (this.integrations) {
        // Run in background (don't block UI)
        this.integrations.getEstimate(newTask.name)
            .then(estimate => {
                if (estimate) {
                    newTask.aiEstimate = estimate;
                    console.log(`Updated ${newTask.name} with estimate: ${estimate}`);
                    // Re-render to show the new estimate
                    this.renderCalendar(); 
                }
            });
    }
    
    return newTask;
  }

  addEvent(event) {
    const newEvent = {
      id: this.generateId(),
      name: event.name,
      start: event.start,
      end: event.end,
      isFixed: true
    };
    
    this.events.push(newEvent);
    console.log(`Event added: ${newEvent.name}`);
    return newEvent;
  }

  autoScheduleTasks() {
    this.tasks.forEach(task => {
        task.isScheduled = false;
        task.scheduledStart = null;
        task.scheduledEnd = null;
    });

    this.events = this.events.filter(event => !event.isTask);

    const taskQueue = [...this.tasks].sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority; 
        }
        return a.deadline - b.deadline; 
    });

    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const availableSlots = this.getAvailableSlots(now, twoWeeksFromNow);

    taskQueue.forEach(task => {
        for (let i = 0; i < availableSlots.length; i++) {
            const slot = availableSlots[i];
            const slotDuration = (slot.end - slot.start) / (60 * 1000); 

            if (slotDuration >= task.duration) {
                task.scheduledStart = new Date(slot.start);
                task.scheduledEnd = new Date(slot.start.getTime() + task.duration * 60 * 1000);
                task.isScheduled = true;

                if (slotDuration === task.duration) {
                    availableSlots.splice(i, 1);
                } else {
                    slot.start = new Date(slot.start.getTime() + task.duration * 60 * 1000 + 
                                         this.settings.minBreakBetweenTasks * 60 * 1000);
                }

                this.events.push({
                    id: task.id,
                    name: task.name,
                    start: task.scheduledStart,
                    end: task.scheduledEnd,
                    isFixed: false,
                    isTask: true,
                    taskId: task.id,
                    aiEstimate: task.aiEstimate // Carry over estimate
                });
                break;
            }
        }
    });
  }

  getAvailableSlots(startDate, endDate) {
    const slots = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const fixedEvents = this.events.filter(event => event.isFixed || event.isTask);
    
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
              slots.push({
                start: new Date(timePointer),
                end: new Date(event.start)
              });
            }
            timePointer = new Date(event.end);
          });
          
          if (timePointer < dayEnd) {
            slots.push({
              start: new Date(timePointer),
              end: new Date(dayEnd)
            });
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }
    return slots.filter(slot => {
      const durationMinutes = (slot.end - slot.start) / (60 * 1000);
      return durationMinutes >= this.settings.minBreakBetweenTasks;
    });
  }

  renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    calendarEl.innerHTML = '';
    const allEvents = [...this.events].sort((a, b) => a.start - b.start);
    
    const eventsByDate = {};
    allEvents.forEach(event => {
      const dateKey = event.start.toDateString();
      if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
      eventsByDate[dateKey].push(event);
    });
    
    Object.keys(eventsByDate).forEach(dateKey => {
      const dateEvents = eventsByDate[dateKey];
      const dateHeader = document.createElement('h3');
      dateHeader.textContent = dateKey;
      calendarEl.appendChild(dateHeader);
      
      const eventsList = document.createElement('ul');
      eventsList.className = 'events-list';
      
      dateEvents.forEach(event => {
        const eventItem = document.createElement('li');
        eventItem.className = event.isTask ? 'task-event' : 'fixed-event';
        
        const startTime = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Show estimate in scheduled items too if available
        const estimateHtml = event.aiEstimate 
            ? `<div style="font-size:0.85em; color:#666; width:100%;">AI Est: ${event.aiEstimate}</div>` 
            : '';

        eventItem.innerHTML = `
          <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
             <span><span class="event-time">${startTime} - ${endTime}</span> <span class="event-name">${event.name}</span></span>
             ${event.isTask ? '<span class="event-badge">Task</span>' : ''}
          </div>
          ${estimateHtml}
        `;
        
        eventsList.appendChild(eventItem);
      });
      calendarEl.appendChild(eventsList);
    });
    
    const unscheduledTasks = this.tasks.filter(task => !task.isScheduled);
    if (unscheduledTasks.length > 0) {
      const unscheduledHeader = document.createElement('h3');
      unscheduledHeader.textContent = 'Unscheduled Tasks';
      calendarEl.appendChild(unscheduledHeader);
      
      const tasksList = document.createElement('ul');
      tasksList.className = 'unscheduled-tasks';
      
      unscheduledTasks.forEach(task => {
        const taskItem = document.createElement('li');
        
        // DISPLAY ESTIMATE HERE
        const estimateHtml = task.aiEstimate 
            ? `<br><strong style="color:#8e44ad;">AI Estimate: ${task.aiEstimate}</strong>` 
            : '';

        taskItem.innerHTML = `
          <span class="task-name">${task.name}</span>
          <span class="task-details">
            Priority: ${task.priority}, 
            Duration: ${task.duration} mins, 
            Deadline: ${task.deadline.toLocaleDateString()}
            ${estimateHtml}
          </span>
        `;
        tasksList.appendChild(taskItem);
      });
      
      calendarEl.appendChild(tasksList);
    }
  }

  generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }
  
  exportData() {
    return { events: this.events, tasks: this.tasks, settings: this.settings };
  }
  
  importData(data) {
    if (data.events) this.events = data.events;
    if (data.tasks) this.tasks = data.tasks;
    if (data.settings) this.settings = data.settings;
    this.renderCalendar();
  }
}

const autoScheduler = new Calendar();
window.autoScheduler = autoScheduler;
