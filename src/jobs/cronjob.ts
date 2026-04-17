import cron from 'node-cron';
import { MailchimpService } from '../services/mailchimp.service';

cron.schedule('0 10 * * 1', async () =>{
// cron.schedule('* * * * *', async () => {
  console.log('[CRON] Weekly email job started.');

  try {
    await MailchimpService.sendCampaign();

    console.log('[CRON] Weekly email job completed successfully.');
  } catch (error) {
    console.error('[CRON] Error during weekly email job:', error);
  }
});
