import mailchimp from '@mailchimp/mailchimp_marketing';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY!,
  server: process.env.MAILCHIMP_SERVER_PREFIX!,
});

const LIST_ID = process.env.MAILCHIMP_LIST_ID!;

export const MailchimpService = {
  /**
   * Fetch emails directly from your existing User model
   */
  fetchUserEmails: async (): Promise<string[]> => {
    const users = await User.find({ email: { $ne: null } }).lean();
    return users.map(user => user.email);
  },

  /**
   * Add emails to Mailchimp list
   */
  addUsersToList: async () => {
    const emails = await MailchimpService.fetchUserEmails();

    if (emails.length === 0) {
      console.log('[Mailchimp] No emails found to add.');
      return;
    }

    const operations = emails.map(email => ({
      method: 'POST',
      path: `/lists/${LIST_ID}/members`,
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
      }),
    }));

    const batch = await (mailchimp as any).batches.start({ operations });
    console.log(`[Mailchimp] Batch add started. Batch ID: ${batch.id}`);

    let batchStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 5000)); 
      batchStatus = await (mailchimp as any).batches.status(batch.id);
      console.log(`[Mailchimp] Batch status: ${batchStatus.status}`);
    } while (batchStatus.status !== 'finished');

    console.log(`[Mailchimp] Batch processing complete.`);
  },

 
  sendCampaign: async () => {
    console.log("list_id :" + LIST_ID)
    
    // Use a constant campaign ID from environment variables
    const CAMPAIGN_ID = process.env.MAILCHIMP_CAMPAIGN_ID!;

    try {
      // Check if campaign exists
      const campaign = await (mailchimp as any).campaigns.get(CAMPAIGN_ID);
      
      if (!campaign) {
        throw new Error(`Campaign with ID ${CAMPAIGN_ID} not found`);
      }

      // Send the existing campaign
      await (mailchimp as any).campaigns.send(CAMPAIGN_ID);
      console.log(`[Mailchimp] Campaign sent: ${CAMPAIGN_ID}`);
    } catch (error) {
      console.error('[Mailchimp] Error sending campaign:', error);
      throw error;
    }
  },

  /**
   * Start a Customer Journey (Automation) for the list
   * @param journeyId The ID of the Customer Journey to start
   */
  startCustomerJourney: async (journeyId: string) => {
    try {
      // Get the automation details using the correct API endpoint
      const automation = await (mailchimp as any).automations.get(journeyId);
      
      if (!automation) {
        throw new Error(`Customer Journey with ID ${journeyId} not found`);
      }

      await (mailchimp as any).automations.start(journeyId);
      console.log(`[Mailchimp] Customer Journey started: ${journeyId}`);
      return true;
    } catch (error) {
      console.error('[Mailchimp] Error starting Customer Journey:', error);
      throw error;
    }
  }
};
