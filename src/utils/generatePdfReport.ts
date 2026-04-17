import PDFDocument from 'pdfkit';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration, Chart as ChartJS, ChartType } from 'chart.js';
import path from 'path';
import fs from 'fs';
import { registerFont } from 'canvas';

// Register fonts with absolute paths
const fontPath = path.join(process.cwd(), 'src', 'assets', 'fonts', 'OpenSans-Regular.ttf');
registerFont(fontPath, { family: 'Open Sans' });

const ChartDataLabels = require('chartjs-plugin-datalabels');
ChartJS.register(ChartDataLabels);

// Define base chart options
const baseChartOptions = {
  responsive: true,
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
      labels: {
        font: {
          family: 'Open Sans',
          size: 12
        },
        padding: 10
      }
    },
    title: {
      display: true,
      font: {
        family: 'Open Sans',
        size: 16
      },
      padding: 10
    }
  },
  scales: {
    x: {
      ticks: {
        font: {
          family: 'Open Sans',
          size: 11
        },
        rotation: 45,
        maxRotation: 45,
        minRotation: 45,
        autoSkip: false
      },
      title: {
        display: true,
        text: 'Month',
        font: {
          family: 'Open Sans',
          size: 9
        },
        padding: 5
      }
    },
    y: {
      ticks: {
        font: {
          family: 'Open Sans',
          size: 11
        }
      },
      title: {
        display: true,
        text: 'Sentiment Rating',
        font: {
          family: 'Open Sans',
          size: 9
        },
        padding: 5
      },
      min: 0,
      max: 10
    }
  }
};

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    datalabels?: {
      color?: string;
      font?: {
        size?: number;
        family?: string;
      };
      formatter?: (value: number, context: { dataIndex: number; chart: { data: { labels: string[] } } }) => string;
      anchor?: string;
      align?: string;
      offset?: number;
      rotation?: (context: { dataIndex: number }) => number;
    };
  }
}

/**
 * Generates a PDF from the provided sentiment analysis data.
 * @param data The sentiment analysis data to be used in the report.
 * @returns A buffer of the generated PDF.
 */
export const generateFreePdfReport = async (data: any): Promise<Buffer> => {
  return new Promise<Buffer>(async (resolve, reject) => {
    console.log(data)
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        bufferPages: true
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Register the font with PDFKit
      doc.registerFont('Open Sans', fontPath);


      const titleFont = 'Helvetica-Bold';
      const regularFont = 'Open Sans';
      const primaryColor = '#2B3674';  
      const secondaryColor = '#707EAE'; 
      const contentWidth = doc.page.width - 100;
      const leftMargin = 50;

      doc.rect(0, 0, doc.page.width, 100).fill('#ffffff');

      const stampX = doc.page.width - 70;
      const stampY = 45; 
      const stampRadius = 30;

      doc.circle(stampX, stampY, stampRadius)
         .strokeColor('#FF0000')
         .lineWidth(1) 
         .stroke(); 

      doc.font(regularFont) 
         .fontSize(20) 
         .fillColor('#FF0000')
         .text(`${data.sentimentAnalysis.aggregate_sentiment.score}/10`, stampX - stampRadius, stampY - 15, {
           align: 'center',
           width: stampRadius * 2
         });

      doc.font(regularFont)
         .fontSize(12) 
         .fillColor('#FF0000')
         .text('score', stampX - stampRadius, stampY + 5, {
           align: 'center',
           width: stampRadius * 2
         });

      const gradeY = stampY + 40; 
      const score = data.sentimentAnalysis.aggregate_sentiment.score;
      let grade = 'D';
      if (score >= 9) grade = 'A';
      else if (score >= 7) grade = 'B';
      else if (score >= 4) grade = 'C';

      doc.font(regularFont)
         .fontSize(14)
         .fillColor('#FF0000')
         .text(`Grade: ${grade}`, stampX - stampRadius, gradeY, {
           align: 'center',
           width: stampRadius * 2
         });

      const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
        width: 500,
        height: 250,
        backgroundColour: 'white'
      });

      const gaugeChartConfig: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',
        data: {
          labels: ['D', 'C', 'B', 'A'],
          datasets: [{
            data: [3, 3, 2, 2],  
            backgroundColor: [
              '#F44336',   
              '#FFC107',   
              '#2196F3',    
              '#4CAF50',   
            ],
            circumference: 180,
            rotation: 270,
            borderWidth: 0,
            borderRadius: 0,
            spacing: 0
          }]
        },
        options: {
          ...baseChartOptions,
          cutout: '70%',
          plugins: {
            ...baseChartOptions.plugins,
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                font: {
                  family: 'Open Sans',
                  size: 10
                },
                padding: 10
              }
            },
            datalabels: {
              color: 'transparent',
              font: {
                family: 'Open Sans',
                size: 10
              }
            }
          },
          scales: {}
        },
        plugins: [{
          id: 'gaugeNeedle',
          afterDraw: (chart: ChartJS) => {
            const { ctx, chartArea } = chart;
            if (!chartArea || chartArea.bottom <= chartArea.top || chartArea.right <= chartArea.left) return;
        
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = chartArea.bottom - 10;
            const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
        
            const normalizedScore = Math.max(1, Math.min(10, score));
            let angleDeg = 0;
        
            if (normalizedScore >= 1 && normalizedScore <= 3) {
              // D: 1-3 → 0° to 45°
              angleDeg = ((normalizedScore - 1) / 2) * 45;
            } else if (normalizedScore > 3 && normalizedScore <= 6) {
              // C: 4-6 → 45° to 100°
              angleDeg = 45 + ((normalizedScore - 4) / 2) * (100 - 45);
            } else if (normalizedScore > 6 && normalizedScore <= 8) {
              // B: 7-8 → 100° to 145°
              angleDeg = 100 + ((normalizedScore - 7) / 1) * (145 - 100);
            } else {
              // A: 9-10 → 145° to 180°
              angleDeg = 145 + ((normalizedScore - 9) / 1) * (180 - 145);
            }
        
            const angle = (180 - angleDeg) * Math.PI / 180;
        
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
        
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#666666';
            ctx.fill();
        
            const needleLength = radius * 0.65;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * needleLength, -Math.sin(angle) * needleLength);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#666666';
            ctx.lineCap = 'round';
            ctx.stroke();
        
            ctx.restore();
          }
        }]
      };

      const gaugeImage = await chartJSNodeCanvas.renderToBuffer(gaugeChartConfig);
      
      const gaugeX = doc.page.width - 320;
      const gaugeY = 200; 
      
      doc.image(gaugeImage, gaugeX, gaugeY, {
        fit: [300, 150], 
        align: 'center'
      });

      try {
        const logoPath = path.join(__dirname, '../assets/logo.png');
        console.log('Looking for logo at:', logoPath);
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 15, { width: 60 });

          doc.moveDown(1.5)
             .font(titleFont)
             .fontSize(24)
             .fillColor(primaryColor)
             .text('Rep', 125, 20)
             .text('Radar', 125, 40, { characterSpacing: 0 });
          
          doc.font(regularFont)
             .fontSize(10)
             .fillColor(secondaryColor)
             .text('by Reputation Return', 125, 60);

        } else {
          console.log('Logo file not found at:', logoPath);

          doc.moveDown(1.5)
             .font(titleFont)
             .fontSize(32)
             .fillColor(primaryColor)
             .text('Rep', 50, 20)
             .text('Radar', 50, 40, { characterSpacing: 0 });
        }
      } catch (error) {
        console.error('Error loading logo:', error);

        doc.moveDown(1.5)
           .font(titleFont)
           .fontSize(32)
           .fillColor(primaryColor)
           .text('Rep', 50, 20)
           .text('Radar', 50, 40, { characterSpacing: 0 });
      }

      doc.moveTo(50, 100)
         .lineTo(doc.page.width - 50, 100)
         .strokeColor(secondaryColor)
         .opacity(0.5)
         .stroke()
         .opacity(1);

      doc.moveDown(3.5)
         .font(titleFont)
         .fontSize(28)
         .fillColor(primaryColor)
         .text('Sentiment Analysis Report', { align: 'center' });

      doc.font(regularFont)
         .fontSize(12)
         .fillColor(secondaryColor)
         .text(new Date().toLocaleDateString('en-GB'), { align: 'center' });
      doc.moveDown(2);

      // Platform Analysis Section
      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Platform Analysis', 50);
      doc.moveDown(1);

      Object.entries(data.sentimentAnalysis.platforms).forEach(([platform, platformData]: [string, any]) => {
        doc.font(titleFont)
           .fontSize(16)
           .fillColor(primaryColor)
           .text(platform, 50);
        doc.moveDown(0.5);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Sentiment:', 50, undefined, { continued: true })
           .font(regularFont)
           .fillColor(secondaryColor)
           .text(` ${platformData.sentiment}`, { width: contentWidth });

        doc.moveDown(0.5);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Score:', 50, undefined, { continued: true })
           .font(regularFont)
           .fillColor(secondaryColor)
           .text(` ${platformData.score}/10`, { width: contentWidth });

        doc.moveDown(0.5);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Key Positives:', 50);
        platformData.key_positives.forEach((point: string) => {
          doc.font(regularFont)
             .fontSize(12)
             .fillColor(secondaryColor)
             .text('•', 50, undefined)
             .moveUp()
             .text(point, 65, undefined, { 
               align: 'left',
               width: contentWidth - 35,
               continued: false
             });
        });

        doc.moveDown(0.5);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Key Negatives:', 50);
        platformData.key_negatives.forEach((point: string) => {
          doc.font(regularFont)
             .fontSize(12)
             .fillColor(secondaryColor)
             .text('•', 50, undefined)
             .moveUp()
             .text(point, 65, undefined, { 
               align: 'left',
               width: contentWidth - 35,
               continued: false
             });
        });

        doc.moveDown(1);
      });

      // Aggregate Analysis Section
      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Aggregate Analysis', 50);
      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Overall Sentiment:', 50, undefined, { continued: true })
         .font(regularFont)
         .fillColor(secondaryColor)
         .text(` ${data.sentimentAnalysis.aggregate_sentiment.sentiment}`, { width: contentWidth });

      doc.moveDown(0.5);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Overall Score:', 50, undefined, { continued: true })
         .font(regularFont)
         .fillColor(secondaryColor)
         .text(` ${data.sentimentAnalysis.aggregate_sentiment.score}/10`, { width: contentWidth });

      // Action Plan Section
      if (data.sentimentAnalysis.action_plan) {
        doc.moveDown(2)
           .font(titleFont)
           .fontSize(20)
           .fillColor(primaryColor)
           .text('Action Plan', 50);
        doc.moveDown(1);

        const thirtyDayPlan = data.sentimentAnalysis.action_plan['30_days'];
        if (thirtyDayPlan) {
          doc.font(titleFont)
             .fontSize(14)
             .fillColor(primaryColor)
             .text('30 Days' + (thirtyDayPlan.objective ? ' - ' + thirtyDayPlan.objective : ''), 50, undefined, {
               width: contentWidth,
               continued: false
             })
             .moveDown(0.5);

          thirtyDayPlan.points.forEach((action: string) => {
            doc.font(regularFont)
               .fontSize(12)
               .fillColor(secondaryColor)
               .text('•', 50, undefined)
               .moveUp()
               .text(action, 65, undefined, { 
                 align: 'left',
                 width: contentWidth - 35,
                 continued: false
               });
          });
          doc.moveDown(2);
        }
      }

      doc.moveDown(3)
         .font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Reputation Analysis', 50);
      doc.moveDown(1);

      let message = '';
      let firstLine = '';

      if (score >= 9) {
        firstLine = 'Your score is "Exceptional!" Congratulations! Maintain your excellent reputation today!';
        message = `Your "Exceptional" score on Rep Radar is an indication of your hard work and desire to maintain a strong image, brand and reputation. Let us help you continue to thrive further. Let's expand your options and opportunities socially, personally, professionally and financially. You can maintain a score of 10 with some strategic moves. You and your business deserve the best, and Reputation Return is here help. Our expert team specializes in optimizing your online image and brand, crafting authentic strategies to boost and maintain your reputation score and trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now! Optimize and preserve your rep.

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

What should you do now?
1) If you haven't yet, you will want to invest in the Premium Pro Plan at Rep Radar for just $11.99/month. Remember, you'll be able to compare yourself to others with this level of service.
2) Next, schedule your free and confidential consultation with Reputation Return to discuss your options and opportunities to suppress or remove bad links, hurtful reviews and damaging news on Google and other search engines.

Invest in Rep Radar and Reputation Return now to transform your online presence and watch your reputation soar. Act now—your winning story starts here!`;
      } else if (score >= 7) {
        firstLine = 'Your score is "Above Average." Imagine if it were exceptional…This affects your image and opportunities! Optimize your reputation today!';
        message = `Your "Above Average" score on Rep Radar is still limiting your options and opportunities socially, personally, professionally and financially. You can quickly get to a 10 with some strategic moves. You and your business deserve better and Reputation Return is here to turn things around. Our expert team specializes in rebuilding your online image and brand, crafting authentic strategies to boost your reputation score and restore trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now!

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

What should you do now?
1) If you haven't yet, you will want to invest in the Premium Pro Plan at Rep Radar for just $11.99/month. Remember, you'll be able to compare yourself to others with this level of service.
2) Next, schedule your free and confidential consultation with Reputation Return to discuss your options and opportunities to suppress or remove bad links, hurtful reviews and damaging news on Google and other search engines.

Invest in Rep Radar and Reputation Return now to transform your online presence and watch your reputation soar. Act now—your best story starts here!`;
      } else if (score >= 4) {
        firstLine = 'Your score is "Just OK!". This affects your image and opportunities! Reclaim your reputation today!';
        message = `Your "OK" score on Rep Radar is limiting your options and opportunities socially, personally, professionally and financially. You are missing out on a lot. You and your business deserve better and Reputation Return is here to turn things around. Our expert team specializes in rebuilding your online image and brand, crafting authentic strategies to boost your reputation score and restore trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now!

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

What should you do now?
1) If you haven't yet, you will want to invest in the Premium Pro Plan at Rep Radar for just $11.99/month. Remember, you'll be able to compare yourself to others with this level of service.
2) Next, schedule your free and confidential consultation with Reputation Return to discuss your options and opportunities to suppress or remove bad links, hurtful reviews and damaging news on Google and other search engines.

Invest in Rep Radar and Reputation Return now to transform your online presence and watch your reputation soar. Act now—your comeback story starts here!`;
      } else {
        firstLine = 'Well, your score is "LOW." That hurts! Reclaim your reputation today!';
        message = `Your bad score on Rep Radar can feel like a punch to the gut. You and your business deserve better, and Reputation Return is here to turn things around. Our expert team specializes in rebuilding your online image and brand, crafting authentic strategies to boost your reputation score and restore trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now!

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

What should you do now?
1) If you haven't yet, you will want to invest in the Premium Pro Plan at Rep Radar for just $11.99/month. Remember, you'll be able to compare yourself to others with this level of service.
2) Next, schedule your free and confidential consultation with Reputation Return to discuss your options and opportunities to suppress or remove bad links, hurtful reviews and damaging news on Google and other search engines.

Invest in Rep Radar and Reputation Return now to transform your online presence and watch your reputation soar. Act now—your comeback story starts here!`;
      }

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text(firstLine, 50, undefined, {
           align: 'left',
           width: contentWidth
         })
         .moveDown(1);

      doc.font(regularFont)
         .fontSize(12)
         .fillColor(secondaryColor)
         .text(message, 50, undefined, {
           align: 'left',
           width: contentWidth,
           lineGap: 5
         });

      // Add blue button with link
      const buttonWidth = 200;
      const buttonHeight = 40;
      const buttonX = (doc.page.width - buttonWidth) / 2;
      const buttonY = doc.y + 30;

      // Draw button background
      doc.save();
      doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 8)
         .fillColor('#2B3674')
         .fill();
      doc.restore();

      // Add button text (centered vertically)
      doc.font(regularFont)
         .fontSize(14)
         .fillColor('#FFFFFF')
         .text('Get Premium Services', buttonX, buttonY + (buttonHeight - 14) / 2, {
           width: buttonWidth,
           align: 'center'
         });

      // Add link annotation (matches button area)
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, 'https://reputationreturn.com/our-services/');

      // Move cursor below button
      doc.y = buttonY + buttonHeight + 30;

      if (doc.y > 650) { 
        doc.addPage();
      }

      doc.moveDown(3)
         .font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Grade Distribution System', 50);
      doc.moveDown(1);

      const tableData = [
        { score: '9-10', grade: 'A', description: 'Exceptional' },
        { score: '7-8', grade: 'B', description: 'Above Average' },
        { score: '4-6', grade: 'C', description: 'Just OK' },
        { score: '1-3', grade: 'D', description: 'Low' }
      ];
      
      const rowHeight = 35;
      const estimatedTableHeight = (tableData.length + 1) * rowHeight;
      
      if (doc.y + estimatedTableHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      
      const tableStartX = 50;
      const tableWidth = 500;
      const columnWidths = {
        scoreRange: 150,
        grade: 150,
        description: 200
      };

      const tableStartY = doc.y;

      doc.rect(tableStartX, tableStartY, tableWidth, rowHeight)
         .fillColor('#f4f4f4')
         .fill();

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor);

      doc.text('Score Range', tableStartX + 20, tableStartY + 10);
      doc.text('Grade', tableStartX + columnWidths.scoreRange + 20, tableStartY + 10);
      doc.text('Description', tableStartX + columnWidths.scoreRange + columnWidths.grade + 20, tableStartY + 10);

      let currentY = tableStartY + rowHeight;

      tableData.forEach((row, index) => {

        if (index % 2 === 1) {
          doc.rect(tableStartX, currentY, tableWidth, rowHeight)
             .fillColor('#f9f9f9')
             .fill();
        }

        doc.font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor);

        const textY = currentY + 10;
        doc.text(row.score, tableStartX + 20, textY);
        doc.text(row.grade, tableStartX + columnWidths.scoreRange + 20, textY);
        doc.text(row.description, tableStartX + columnWidths.scoreRange + columnWidths.grade + 20, textY);

        currentY += rowHeight;
      });

      doc.y = currentY + 20;

      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(new Error('Failed to generate PDF'));
    }
  });
};

export const generatePaidPdfReport = async (data: any): Promise<Buffer> => {
  console.log(data)
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        bufferPages: true
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Register the font with PDFKit
      doc.registerFont('Open Sans', fontPath);

      const titleFont = 'Helvetica-Bold';
      const regularFont = 'Open Sans';
      const primaryColor = '#2B3674';  
      const secondaryColor = '#707EAE';
      const contentWidth = doc.page.width - 100;
      const leftMargin = 50; 

      doc.rect(0, 0, doc.page.width, 100).fill('#ffffff');

      const stampX = doc.page.width - 70; 
      const stampY = 45; 
      const stampRadius = 30;

      doc.circle(stampX, stampY, stampRadius)
         .strokeColor('#FF0000')
         .lineWidth(1) 
         .stroke();

      doc.font(regularFont) 
         .fontSize(20) 
         .fillColor('#FF0000') 
         .text(`${data.sentimentAnalysis.overall.score}/10`, stampX - stampRadius, stampY - 15, {
           align: 'center',
           width: stampRadius * 2
         });

      doc.font(regularFont)
         .fontSize(12) 
         .fillColor('#FF0000') 
         .text('score', stampX - stampRadius, stampY + 5, {
           align: 'center',
           width: stampRadius * 2
         });

      const gradeY = stampY + 40; 
      const score = data.sentimentAnalysis.overall.score;
      let grade = 'D';
      if (score >= 9) grade = 'A';
      else if (score >= 7) grade = 'B';
      else if (score >= 4) grade = 'C';

      doc.font(regularFont)
         .fontSize(14)
         .fillColor('#FF0000')
         .text(`Grade: ${grade}`, stampX - stampRadius, gradeY, {
           align: 'center',
           width: stampRadius * 2
         });

      const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
        width: 500,
        height: 250,
        backgroundColour: 'white'
      });

      const gaugeChartConfig: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',
        data: {
          labels: ['D', 'C', 'B', 'A'],
          datasets: [{
            data: [3, 3, 2, 2],  
            backgroundColor: [
              '#F44336', 
              '#FFC107',  
              '#2196F3',   
              '#4CAF50',    
            ],
            circumference: 180,
            rotation: 270,
            borderWidth: 0,
            borderRadius: 0,
            spacing: 0
          }]
        },
        options: {
          ...baseChartOptions,
          cutout: '70%',
          plugins: {
            ...baseChartOptions.plugins,
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                font: {
                  family: 'Open Sans',
                  size: 8
                },
                padding: 10
              }
            },
            datalabels: {
              color: 'transparent',
              font: {
                family: 'Open Sans',
                size: 10
              }
            }
          },
          scales: {}
        },
        plugins: [{
          id: 'gaugeNeedle',
          afterDraw: (chart: ChartJS) => {
            const { ctx, chartArea } = chart;
            if (!chartArea || chartArea.bottom <= chartArea.top || chartArea.right <= chartArea.left) return;
          
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = chartArea.bottom - 10;
            const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
          
            const normalizedScore = Math.max(1, Math.min(10, score));
            let angleDeg = 0;
          
            if (normalizedScore >= 1 && normalizedScore <= 3) {
              // D: 1-3 → 0° to 45°
              angleDeg = ((normalizedScore - 1) / 2) * 45;
            } else if (normalizedScore > 3 && normalizedScore <= 6) {
              // C: 4-6 → 45° to 100°
              angleDeg = 45 + ((normalizedScore - 4) / 2) * (100 - 45);
            } else if (normalizedScore > 6 && normalizedScore <= 8) {
              // B: 7-8 → 100° to 145°
              angleDeg = 100 + ((normalizedScore - 7) / 1) * (145 - 100);
            } else {
              // A: 9-10 → 145° to 180°
              angleDeg = 145 + ((normalizedScore - 9) / 1) * (180 - 145);
            }
          
            const angle = (180 - angleDeg) * Math.PI / 180;
          
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
          
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#666666';
            ctx.fill();
          
            const needleLength = radius * 0.65;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * needleLength, -Math.sin(angle) * needleLength);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#666666';
            ctx.lineCap = 'round';
            ctx.stroke();
          
            ctx.restore();
          }
        }]
      };

      const gaugeImage = await chartJSNodeCanvas.renderToBuffer(gaugeChartConfig);
      
      const gaugeX = doc.page.width - 320; 
      const gaugeY = 200; 
      
      doc.image(gaugeImage, gaugeX, gaugeY, {
        fit: [300, 150], 
        align: 'center'
      });

      try {
        const logoPath = path.join(__dirname, '../assets/logo.png');
        console.log('Looking for logo at:', logoPath);
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 15, { width: 60 });

          doc.moveDown(1.5)
             .font(titleFont)
             .fontSize(24)
             .fillColor(primaryColor)
             .text('Rep', 125, 20)
             .text('Radar', 125, 40, { characterSpacing: 0 });

          doc.font(regularFont)
             .fontSize(10)
             .fillColor(secondaryColor)
             .text('by Reputation Return', 125, 60);
        } else {
          console.log('Logo file not found at:', logoPath);

          doc.moveDown(1.5)
             .font(titleFont)
             .fontSize(32)
             .fillColor(primaryColor)
             .text('Rep', 50, 20)
             .text('Radar', 50, 40, { characterSpacing: 0 });
        }
      } catch (error) {
        console.error('Error loading logo:', error);

        doc.moveDown(1.5)
           .font(titleFont)
           .fontSize(32)
           .fillColor(primaryColor)
           .text('Rep', 50, 20)
           .text('Radar', 50, 40, { characterSpacing: 0 });
      }

      doc.moveTo(50, 100)
         .lineTo(doc.page.width - 50, 100)
         .strokeColor(secondaryColor)
         .opacity(0.5)
         .stroke()
         .opacity(1);

      doc.moveDown(3.5)
         .font(titleFont)
         .fontSize(28)
         .fillColor(primaryColor)
         .text('Sentiment Analysis Report', { align: 'center' });

      doc.font(regularFont)
         .fontSize(12)
         .fillColor(secondaryColor)
         .text(new Date().toLocaleDateString('en-GB'), { align: 'center' });
      doc.moveDown(2);

      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Overview', 50);
      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Platform:', 50, undefined, { continued: true })
         .font(regularFont)
         .fillColor(secondaryColor)
         .text(` ${data.platform}`, { width: contentWidth });

      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Brand:', 50, undefined, { continued: true })
         .font(regularFont)
         .fillColor(secondaryColor)
         .text(` ${data.brand}`, { width: contentWidth });

      doc.moveDown(2);

      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Competitors', 50);
      doc.moveDown(1);

      if (data.competitorsSentimentAnalysis && Array.isArray(data.competitorsSentimentAnalysis)) {
        data.competitorsSentimentAnalysis.forEach((competitor: any) => {
          doc.font(regularFont)
             .fontSize(12)
             .fillColor(secondaryColor)
             .text(`• ${competitor.name} (Score: ${competitor.rating}/10)`, 50, undefined, { 
               width: contentWidth
             });
        });
      } else {
        doc.font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor)
           .text('No competitor data available', 50, undefined, { 
             width: contentWidth
           });
      }

      doc.moveDown(2);

      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Sentiment Analysis', 50);
      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Rating:', 50, undefined, { continued: true })
         .font(regularFont)
         .fillColor(secondaryColor)
         .text(` ${data.sentimentAnalysis.overall.score}/10`, { width: contentWidth });

      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Sentiment:', 50, undefined, { continued: true })
         .font(regularFont)
         .fillColor(secondaryColor)
         .text(` ${data.sentimentAnalysis.overall.sentiment}`, { width: contentWidth });

      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Key Positives:', 50);
      data.sentimentAnalysis.overall.key_positives.forEach((point: string) => {
        doc.font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor)
           .text('•', 50, undefined)
           .moveUp()
           .text(point, 65, undefined, { 
             align: 'left',
             width: contentWidth - 35,
             continued: false
           });
      });

      doc.moveDown(1);

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text('Key Negatives:', 50);
      data.sentimentAnalysis.overall.key_negatives.forEach((point: string) => {
        doc.font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor)
           .text('•', 50, undefined)
           .moveUp()
           .text(point, 65, undefined, { 
             align: 'left',
             width: contentWidth - 35,
             continued: false
           });
      });

      if (data.sentimentAnalysis.action_plan) {
        
        doc.moveDown(2)
           .font(titleFont)
           .fontSize(20)
           .fillColor(primaryColor)
           .text('Action Plan', 50);
        doc.moveDown(1);

        const getActionPlanData = (period: string) => {
          const hyphenDayKey = `${period}-day`;
          const hyphenDaysKey = `${period}-days`;
          const underscoreKey = `${period}_days`;
          const planData = data.sentimentAnalysis.action_plan[hyphenDayKey] || 
                         data.sentimentAnalysis.action_plan[hyphenDaysKey] || 
                         data.sentimentAnalysis.action_plan[underscoreKey];
          
          console.log(`Checking action plan for period ${period}:`, planData);
          
          if (!planData) return null;

          return {
            objective: planData.objective || '',
            points: Array.isArray(planData.points) ? planData.points : 
                   Array.isArray(planData) ? planData : []
          };
        };

        const thirtyDayPlan = getActionPlanData('30');
        console.log('Thirty Day Plan:', thirtyDayPlan);
        if (thirtyDayPlan) {
          doc.font(titleFont)
             .fontSize(14)
             .fillColor(primaryColor)
             .text('30 Days' + (thirtyDayPlan.objective ? ' - ' + thirtyDayPlan.objective : ''), 50, undefined, {
               width: contentWidth,
               continued: false
             })
             .moveDown(0.5);

          thirtyDayPlan.points.forEach((action: string) => {
            doc.font(regularFont)
               .fontSize(12)
               .fillColor(secondaryColor)
               .text('•', 50, undefined)
               .moveUp()
               .text(action, 65, undefined, { 
                 align: 'left',
                 width: contentWidth - 35,
                 continued: false
               });
          });
          doc.moveDown(1);
        }

        const sixtyDayPlan = getActionPlanData('60');
        if (sixtyDayPlan) {
          doc.font(titleFont)
             .fontSize(14)
             .fillColor(primaryColor)
             .text('60 Days' + (sixtyDayPlan.objective ? ' - ' + sixtyDayPlan.objective : ''), 50, undefined, {
               width: contentWidth,
               continued: false
             })
             .moveDown(0.5);

          sixtyDayPlan.points.forEach((action: string) => {
            doc.font(regularFont)
               .fontSize(12)
               .fillColor(secondaryColor)
               .text('•', 50, undefined)
               .moveUp()
               .text(action, 65, undefined, { 
                 align: 'left',
                 width: contentWidth - 35,
                 continued: false
               });
          });
          doc.moveDown(1);
        }

        const ninetyDayPlan = getActionPlanData('90');
        if (ninetyDayPlan) {
          doc.font(titleFont)
             .fontSize(14)
             .fillColor(primaryColor)
             .text('90 Days' + (ninetyDayPlan.objective ? ' - ' + ninetyDayPlan.objective : ''), 50, undefined, {
               width: contentWidth,
               continued: false
             })
             .moveDown(0.5);

          ninetyDayPlan.points.forEach((action: string) => {
            doc.font(regularFont)
               .fontSize(12)
               .fillColor(secondaryColor)
               .text('•', 50, undefined)
               .moveUp()
               .text(action, 65, undefined, { 
                 align: 'left',
                 width: contentWidth - 35,
                 continued: false
               });
          });
          doc.moveDown(2);
        }
      }

      doc.addPage();

      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Analysis Charts', { align: 'center' });
      doc.moveDown(2);
      
      doc.font(titleFont)
         .fontSize(16)
         .fillColor(primaryColor)
         .text('Sentiment Trend', { align: 'center' });
      doc.moveDown();

      const sentimentOverTimeChartConfig: ChartConfiguration = {
        type: 'line',
        data: {
          labels: data.sentimentAnalysis.monthly_trends ? 
            data.sentimentAnalysis.monthly_trends.map((item: any) => item.month) : 
            [],
          datasets: [{
            label: 'Brand Sentiment Over Time',
            data: data.sentimentAnalysis.monthly_trends ? 
              data.sentimentAnalysis.monthly_trends.map((item: any) => item.score) : 
              [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.4,
            fill: true,
          }],
        },
        options: {
          ...baseChartOptions,
          plugins: {
            ...baseChartOptions.plugins,
            title: {
              ...baseChartOptions.plugins.title,
              text: 'Brand Sentiment Trend'
            }
          },
          scales: {
            x: {
              ...baseChartOptions.scales.x,
              title: {
                display: true,
                text: 'Month',
                font: {
                  family: 'Open Sans',
                  size: 9
                }
              }
            },
            y: {
              ...baseChartOptions.scales.y,
              title: {
                display: true,
                text: 'Sentiment Rating',
                font: {
                  family: 'Open Sans',
                  size: 9
                }
              },
              min: 0,
              max: 10
            }
          }
        }
      };

      const sentimentOverTimeImage = await chartJSNodeCanvas.renderToBuffer(sentimentOverTimeChartConfig);
      doc.image(sentimentOverTimeImage, {
        fit: [500, 250],
        align: 'center'
      });
      
      doc.moveDown(3);

      doc.font(titleFont)
         .fontSize(16)
         .fillColor(primaryColor)
         .text('Competitor Comparison', { align: 'center' });
      doc.moveDown();

      const competitorsSentimentChartConfig: ChartConfiguration = {
        type: 'bar',
        data: {
          labels: ['Your Brand', ...(data.competitorsSentimentAnalysis ? data.competitorsSentimentAnalysis.map((item: any) => item.name) : [])],
          datasets: [{
            label: 'Sentiment Ratings',
            data: [data.sentimentAnalysis.overall.score, ...(data.competitorsSentimentAnalysis ? data.competitorsSentimentAnalysis.map((item: any) => item.rating) : [])],
            backgroundColor: [
              'rgba(75, 192, 192, 0.8)',
              ...(data.competitorsSentimentAnalysis ? data.competitorsSentimentAnalysis.map(() => 'rgba(255, 99, 132, 0.5)') : [])
            ],
            borderColor: [
              'rgb(75, 192, 192)',
              ...(data.competitorsSentimentAnalysis ? data.competitorsSentimentAnalysis.map(() => 'rgb(255, 99, 132)') : [])
            ],
            borderWidth: 1
          }]
        },
        options: {
          ...baseChartOptions,
          plugins: {
            ...baseChartOptions.plugins,
            title: {
              ...baseChartOptions.plugins.title,
              text: 'Brand vs Competitors Sentiment'
            }
          },
          scales: {
            x: {
              ...baseChartOptions.scales.x,
              title: {
                display: true,
                text: 'Brands',
                font: {
                  family: 'Open Sans',
                  size: 9
                }
              }
            },
            y: {
              ...baseChartOptions.scales.y,
              title: {
                display: true,
                text: 'Sentiment Rating',
                font: {
                  family: 'Open Sans',
                  size: 9
                }
              },
              min: 0,
              max: 10
            }
          }
        }
      };

      const competitorsSentimentImage = await chartJSNodeCanvas.renderToBuffer(competitorsSentimentChartConfig);
      doc.image(competitorsSentimentImage, {
        fit: [500, 250],
        align: 'center'
      });

      doc.addPage();

      doc.font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Detailed Competitor Analysis');
      doc.moveDown(1);

      data.competitorsSentimentAnalysis.forEach((competitor: any, index: number) => {
        if (index > 0 && doc.y > 700) {
          doc.addPage();
        }

        doc.font(titleFont)
           .fontSize(16)
           .fillColor(primaryColor)
           .text(competitor.name);
        doc.moveDown(1);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Rating:', { continued: true })
           .font(regularFont)
           .fillColor(secondaryColor)
           .text(` ${competitor.rating}/10`, { width: contentWidth });

        doc.moveDown(1);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Sentiment:', { continued: true })
           .font(regularFont)
           .fillColor(secondaryColor)
           .text(` ${competitor.sentiment}`, { width: contentWidth });

        doc.moveDown(1);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Reasoning:')
           .moveDown(0.5)
           .font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor)
           .text(competitor.reasoning, { 
             align: 'justify',
             width: contentWidth
           });

        doc.moveDown(1);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Comparison with Brand:')
           .moveDown(0.5)
           .font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor)
           .text(competitor.comparison_with_brand, { 
             align: 'justify',
             width: contentWidth
           });

        doc.moveDown(1);

        doc.font(titleFont)
           .fontSize(14)
           .fillColor(primaryColor)
           .text('Key Positives:')
           .moveDown(0.5);
        
        if (competitor.key_positives && Array.isArray(competitor.key_positives)) {
          competitor.key_positives.forEach((point: string) => {
            doc.font(regularFont)
               .fontSize(12)
               .fillColor(secondaryColor)
               .text('•', 50, undefined)
               .moveUp()
               .text(point, 65, undefined, { 
                 align: 'left',
                 width: contentWidth - 35,
                 continued: false
               });
          });
        }

        doc.moveDown(2);
      });

      doc.moveDown(3)
         .font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Reputation Analysis', 50);
      doc.moveDown(1);

      let message = '';
      let firstLine = '';

      if (score >= 9) {
        firstLine = 'Your score is "Exceptional!" Congratulations! Maintain your excellent reputation today!';
        message = `Your "Exceptional" score on Rep Radar is an indication of your hard work and desire to maintain a strong image, brand and reputation. Let us help you continue to thrive further. Let's expand your options and opportunities socially, personally, professionally and financially. You can maintain a score of 10 with some strategic moves. You and your business deserve the best, and Reputation Return is here help. Our expert team specializes in optimizing your online image and brand, crafting authentic strategies to boost and maintain your reputation score and trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now! Optimize and preserve your rep.

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

What should you do now?
1) If you haven't yet, you will want to invest in the Premium Pro Plan at Rep Radar for just $11.99/month. Remember, you'll be able to compare yourself to others with this level of service.
2) Next, schedule your free and confidential consultation with Reputation Return to discuss your options and opportunities to suppress or remove bad links, hurtful reviews and damaging news on Google and other search engines.

Invest in Rep Radar and Reputation Return now to transform your online presence and watch your reputation soar. Act now—your winning story starts here!`;
      } else if (score >= 7) {
        firstLine = 'Your score is "Above Average." Imagine if it were exceptional…This affects your image and opportunities! Optimize your reputation today!';
        message = `Your "Above Average" score on Rep Radar is still limiting your options and opportunities socially, personally, professionally and financially. You can quickly get to a 10 with some strategic moves. You and your business deserve better and Reputation Return is here to turn things around. Our expert team specializes in rebuilding your online image and brand, crafting authentic strategies to boost your reputation score and restore trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now!

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 
`;
      } else if (score >= 4) {
        firstLine = 'Your score is "Just OK!". This affects your image and opportunities! Reclaim your reputation today!';
        message = `Your "OK" score on Rep Radar is limiting your options and opportunities socially, personally, professionally and financially. You are missing out on a lot. You and your business deserve better and Reputation Return is here to turn things around. Our expert team specializes in rebuilding your online image and brand, crafting authentic strategies to boost your reputation score and restore trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now!

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

`;
      } else {
        firstLine = 'Well, your score is "LOW." That hurts! Reclaim your reputation today!';
        message = `Your bad score on Rep Radar can feel like a punch to the gut. You and your business deserve better, and Reputation Return is here to turn things around. Our expert team specializes in rebuilding your online image and brand, crafting authentic strategies to boost your reputation score and restore trust. Don't let negative reviews, harmful links, mug shots, legal issues, or bad online news define you (or your business)—take control now!

With our Rep Radar Premium Pro Plan, you'll stay ahead of the curve. This premium service option monitors your reputation in real-time, tracking improvements and spotting potential issues before they escalate. It's like having a 24/7 guardian for your brand. 

`;
      }

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor)
         .text(firstLine, 50, undefined, {
           align: 'left',
           width: contentWidth
         })
         .moveDown(1);

      doc.font(regularFont)
         .fontSize(12)
         .fillColor(secondaryColor)
         .text(message, 50, undefined, {
           align: 'left',
           width: contentWidth,
           lineGap: 5
         });

      // Add blue button with link
      const buttonWidth = 200;
      const buttonHeight = 40;
      const buttonX = (doc.page.width - buttonWidth) / 2;
      const buttonY = doc.y + 30;

      // Draw button background
      doc.save();
      doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 8)
         .fillColor('#2B3674')
         .fill();
      doc.restore();

      // Add button text (centered vertically)
      doc.font(regularFont)
         .fontSize(14)
         .fillColor('#FFFFFF')
         .text('Get Premium Services', buttonX, buttonY + (buttonHeight - 14) / 2, {
           width: buttonWidth,
           align: 'center'
         });

      // Add link annotation (matches button area)
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, 'https://reputationreturn.com/our-services/');

      // Move cursor below button
      doc.y = buttonY + buttonHeight + 30;

      if (doc.y > 650) {
        doc.addPage();
      }

      doc.moveDown(3)
         .font(titleFont)
         .fontSize(20)
         .fillColor(primaryColor)
         .text('Grade Distribution System', 50);
      doc.moveDown(1);

      const tableData = [
        { score: '9-10', grade: 'A', description: 'Exceptional' },
        { score: '7-8', grade: 'B', description: 'Above Average' },
        { score: '4-6', grade: 'C', description: 'Just OK' },
        { score: '1-3', grade: 'D', description: 'Low' }
      ];
      
      const rowHeight = 35;
      const estimatedTableHeight = (tableData.length + 1) * rowHeight; 
      
      if (doc.y + estimatedTableHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      

      const tableStartX = 50;
      const tableWidth = 500;
      const columnWidths = {
        scoreRange: 150,
        grade: 150,
        description: 200
      };

      const tableStartY = doc.y;

      doc.rect(tableStartX, tableStartY, tableWidth, rowHeight)
         .fillColor('#f4f4f4')
         .fill();

      doc.font(titleFont)
         .fontSize(14)
         .fillColor(primaryColor);

      doc.text('Score Range', tableStartX + 20, tableStartY + 10);
      doc.text('Grade', tableStartX + columnWidths.scoreRange + 20, tableStartY + 10);
      doc.text('Description', tableStartX + columnWidths.scoreRange + columnWidths.grade + 20, tableStartY + 10);

      let currentY = tableStartY + rowHeight;

      tableData.forEach((row, index) => {

        if (index % 2 === 1) {
          doc.rect(tableStartX, currentY, tableWidth, rowHeight)
             .fillColor('#f9f9f9')
             .fill();
        }

        doc.font(regularFont)
           .fontSize(12)
           .fillColor(secondaryColor);

        const textY = currentY + 10;
        doc.text(row.score, tableStartX + 20, textY);
        doc.text(row.grade, tableStartX + columnWidths.scoreRange + 20, textY);
        doc.text(row.description, tableStartX + columnWidths.scoreRange + columnWidths.grade + 20, textY);

        currentY += rowHeight;
      });

      doc.y = currentY + 20;

      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(new Error('Failed to generate PDF'));
    }
  });
};
