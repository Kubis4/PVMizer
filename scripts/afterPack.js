const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  
  // Languages to keep: English (en-US) and Slovak (sk)
  const keepLanguages = ['en-US', 'sk'];
  
  try {
    if (fs.existsSync(localesDir)) {
      const files = fs.readdirSync(localesDir);
      
      files.forEach(file => {
        // Remove the .pak extension and check if it's in the keep list
        const lang = file.replace('.pak', '');
        
        if (!keepLanguages.includes(lang)) {
          const filePath = path.join(localesDir, file);
          fs.unlinkSync(filePath);
          console.log(`Removed locale: ${file}`);
        }
      });
      
      console.log('Locale cleanup completed. Kept: en-US, sk');
    }
  } catch (error) {
    console.error('Error during locale cleanup:', error);
  }
};
