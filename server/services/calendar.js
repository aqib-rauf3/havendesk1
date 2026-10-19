/**
 * HavenDesk Multi-Tenant Calendar Service
 * Reads and writes bookings directly to the SQLite database.
 */

import { db } from '../db/database.js';

export class CalendarService {
  /**
   * Return available slots for a tenant
   */
  getAvailableSlots(tenantId, isEmergency = false) {
    const slots = [];
    const now = new Date();

    if (isEmergency) {
      const emergencyTime1 = new Date(now.getTime() + 45 * 60000);
      const emergencyTime2 = new Date(now.getTime() + 120 * 60000);
      return [
        {
          id: `slot_emer_1`,
          label: `Today (Immediate Emergency Priority) — ${this._formatTime(emergencyTime1)}`,
          iso: emergencyTime1.toISOString(),
          isEmergency: true
        },
        {
          id: `slot_emer_2`,
          label: `Today (Emergency Backup Crew) — ${this._formatTime(emergencyTime2)}`,
          iso: emergencyTime2.toISOString(),
          isEmergency: true
        }
      ];
    }

    // Standard business slots over the next 3 business days
    const existingAppointments = db.query(
      "SELECT scheduled_slot FROM appointments WHERE tenant_id = ? AND status != 'CANCELED'",
      [tenantId]
    ).map(a => a.scheduled_slot);

    const bookedSet = new Set(existingAppointments);
    const standardHours = [9, 11, 14, 16]; // 9 AM, 11 AM, 2 PM, 4 PM

    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + dayOffset);
      const dayName = dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : targetDate.toLocaleDateString("en-US", { weekday: "long" });

      for (const hour of standardHours) {
        targetDate.setHours(hour, 0, 0, 0);
        const slotLabel = `${dayName} at ${this._formatTime(targetDate)}`;

        if (targetDate > now && !bookedSet.has(slotLabel)) {
          slots.push({
            id: `slot_${dayOffset}_${hour}`,
            label: slotLabel,
            iso: targetDate.toISOString(),
            isEmergency: false
          });
        }
      }
    }

    return slots.slice(0, 5);
  }

  _formatTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  bookAppointment(tenantId, { customerName, phone, serviceName, timeSlot, leadId = null, channel = 'voice', notes = '' }) {
    const confirmationCode = `BK-${Math.floor(100000 + Math.random() * 900000)}`;
    const id = `apt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    db.run(`
      INSERT INTO appointments (
        id, tenant_id, lead_id, confirmation_code, customer_name, phone, service_name, scheduled_slot, status, channel, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
    `, [id, tenantId, leadId, confirmationCode, customerName, phone, serviceName, timeSlot, channel, notes]);

    return {
      id,
      confirmationCode,
      customerName,
      phone,
      serviceName,
      scheduledSlot: timeSlot,
      status: 'CONFIRMED'
    };
  }
}

export const calendarService = new CalendarService();
export default calendarService;
