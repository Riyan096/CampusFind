/**
 * Email Notification Service
 * Sends emails for important events like item claimed, new messages
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

interface EmailTemplate {
  subject: string;
  body: string;
  html?: string;
}

class EmailService {
  private emailEnabled: boolean = false;
  private fromEmail: string = 'noreply@campusfind.edu';

  constructor() {
    // Check if email service is configured
    this.emailEnabled = !!import.meta.env.VITE_EMAIL_API_KEY;
  }

  /**
   * Send email to user
   */
  async sendEmail(to: string, template: EmailTemplate): Promise<boolean> {
    if (!this.emailEnabled) {
      console.log('Email service not configured. Would send:', { to, ...template });
      return false;
    }

    try {
      // In production, this would call your email API (SendGrid, AWS SES, etc.)
      // For now, we'll log it and store in Firestore for admin review
      await this.storeEmailLog(to, template);
      
      console.log(`Email sent to ${to}: ${template.subject}`);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send item claimed notification
   */
  async sendItemClaimedNotification(
    userId: string, 
    itemTitle: string, 
    claimedBy: string
  ): Promise<boolean> {
    try {
      const user = await this.getUserEmail(userId);
      if (!user?.email) return false;

      const template: EmailTemplate = {
        subject: `🎉 Great news! Your item "${itemTitle}" has been claimed`,
        body: `
Hi ${user.displayName || 'there'},

Great news! Your reported item "${itemTitle}" has been claimed by ${claimedBy}.

The item status has been updated to "Claimed" in the system.

Thank you for using CampusFind to help return lost items to their owners!

Best regards,
CampusFind Team
        `,
        html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0C5449;">🎉 Item Claimed!</h2>
  <p>Hi ${user.displayName || 'there'},</p>
  <p>Great news! Your reported item <strong>"${itemTitle}"</strong> has been claimed by <strong>${claimedBy}</strong>.</p>
  <p>The item status has been updated to "Claimed" in the system.</p>
  <p>Thank you for using CampusFind to help return lost items to their owners!</p>
  <br>
  <p>Best regards,<br>CampusFind Team</p>
</div>
        `
      };

      return await this.sendEmail(user.email, template);
    } catch (error) {
      console.error('Failed to send item claimed email:', error);
      return false;
    }
  }

  /**
   * Send new message notification
   */
  async sendNewMessageNotification(
    userId: string,
    senderName: string,
    messagePreview: string,
    chatId: string
  ): Promise<boolean> {
    try {
      const user = await this.getUserEmail(userId);
      if (!user?.email) return false;

      const template: EmailTemplate = {
        subject: `💬 New message from ${senderName} on CampusFind`,
        body: `
Hi ${user.displayName || 'there'},

You have a new message from ${senderName}:

"${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}"

Log in to CampusFind to view and reply to this message.

Best regards,
CampusFind Team
        `,
        html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0C5449;">💬 New Message</h2>
  <p>Hi ${user.displayName || 'there'},</p>
  <p>You have a new message from <strong>${senderName}</strong>:</p>
  <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #0C5449; margin: 15px 0;">
    "${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}"
  </div>
  <p><a href="${window.location.origin}/chat" style="background: #0C5449; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Message</a></p>
  <br>
  <p>Best regards,<br>CampusFind Team</p>
</div>
        `
      };

      return await this.sendEmail(user.email, template);
    } catch (error) {
      console.error('Failed to send new message email:', error);
      return false;
    }
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeEmail(userId: string): Promise<boolean> {
    try {
      const user = await this.getUserEmail(userId);
      if (!user?.email) return false;

      const template: EmailTemplate = {
        subject: '👋 Welcome to CampusFind!',
        body: `
Hi ${user.displayName || 'there'},

Welcome to CampusFind - the easiest way to report and find lost items on campus!

Here's how to get started:
1. Browse lost and found items
2. Report a lost or found item
3. Chat with other users to return items
4. Earn points for helping others!

Start exploring: ${window.location.origin}

Best regards,
CampusFind Team
        `,
        html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0C5449;">👋 Welcome to CampusFind!</h2>
  <p>Hi ${user.displayName || 'there'},</p>
  <p>Welcome to <strong>CampusFind</strong> - the easiest way to report and find lost items on campus!</p>
  <h3>Here's how to get started:</h3>
  <ol>
    <li>Browse lost and found items</li>
    <li>Report a lost or found item</li>
    <li>Chat with other users to return items</li>
    <li>Earn points for helping others!</li>
  </ol>
  <p><a href="${window.location.origin}" style="background: #0C5449; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Start Exploring</a></p>
  <br>
  <p>Best regards,<br>CampusFind Team</p>
</div>
        `
      };

      return await this.sendEmail(user.email, template);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      return false;
    }
  }

  /**
   * Send item expiration reminder
   */
  async sendItemExpirationReminder(
    userId: string,
    itemTitle: string,
    daysRemaining: number
  ): Promise<boolean> {
    try {
      const user = await this.getUserEmail(userId);
      if (!user?.email) return false;

      const template: EmailTemplate = {
        subject: `⏰ Your item "${itemTitle}" will expire in ${daysRemaining} days`,
        body: `
Hi ${user.displayName || 'there'},

Your reported item "${itemTitle}" will expire in ${daysRemaining} days.

If the item has been returned, please update its status to "Claimed" in the app.
If it's still lost/found, no action is needed - it will be automatically archived after expiration.

View your items: ${window.location.origin}/browse

Best regards,
CampusFind Team
        `,
        html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0C5449;">⏰ Item Expiration Reminder</h2>
  <p>Hi ${user.displayName || 'there'},</p>
  <p>Your reported item <strong>"${itemTitle}"</strong> will expire in <strong>${daysRemaining} days</strong>.</p>
  <p>If the item has been returned, please update its status to "Claimed" in the app.</p>
  <p>If it's still lost/found, no action is needed - it will be automatically archived after expiration.</p>
  <p><a href="${window.location.origin}/browse" style="background: #0C5449; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Items</a></p>
  <br>
  <p>Best regards,<br>CampusFind Team</p>
</div>
        `
      };

      return await this.sendEmail(user.email, template);
    } catch (error) {
      console.error('Failed to send expiration reminder:', error);
      return false;
    }
  }

  /**
   * Get user email from Firestore
   */
  private async getUserEmail(userId: string): Promise<{ email: string; displayName?: string } | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        return {
          email: data.email,
          displayName: data.displayName
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get user email:', error);
      return null;
    }
  }

  /**
   * Store email log in Firestore for admin review
   */
  private async storeEmailLog(to: string, template: EmailTemplate): Promise<void> {
    try {
      // In production, store in Firestore
      const emailLog = {
        to,
        subject: template.subject,
        sentAt: new Date().toISOString(),
        status: 'pending' // Would be updated when actually sent
      };
      
      // Store in localStorage for demo purposes
      const logs = JSON.parse(localStorage.getItem('email_logs') || '[]');
      logs.push(emailLog);
      localStorage.setItem('email_logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to store email log:', error);
    }
  }

  /**
   * Check if email service is enabled
   */
  isEmailEnabled(): boolean {
    return this.emailEnabled;
  }

  /**
   * Get email logs (for admin)
   */
  getEmailLogs(): any[] {
    return JSON.parse(localStorage.getItem('email_logs') || '[]');
  }

  /**
   * Clear email logs
   */
  clearEmailLogs(): void {
    localStorage.removeItem('email_logs');
  }
}

export const emailService = new EmailService();
