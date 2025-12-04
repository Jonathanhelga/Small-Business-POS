import { getAllItems } from "./item_search.js";

const itemCardTemplate = document.getElementById('barcodeGeneratorTemplate')
const paperBarcodeTemplate= document.getElementById('paperBarcodeTemplate')
const container = document.getElementById('barcode-item-list')
const displayContainer = document.getElementById('barcode-display')

let currentObjectUrls = [];
function cleanupObjectUrls() {
    currentObjectUrls.forEach(url => URL.revokeObjectURL(url));
    currentObjectUrls = [];
}
function fetchDataForPaper(item, file = null){
    cleanupObjectUrls();
    displayContainer.innerHTML = '';

    const clone = paperBarcodeTemplate.content.cloneNode(true);
    clone.querySelector('.js-barcode-item-name').textContent = item.item_name ?? '';
    clone.querySelector('.js-barcode-item-price').textContent = formatCurrency(item.selling_price) ?? '';

    const itemIMG = clone.querySelector('.item-img');
    if(itemIMG && file){
        const objectUrl = URL.createObjectURL(file);
        itemIMG.src = objectUrl;
        currentObjectUrls.push(objectUrl);
    }
    else if(itemIMG){
        itemIMG.src = '';
        itemIMG.alt = "No image Uploaded";
    }
    const barcodeLocation = clone.querySelector('.barcode');
    const itemsku = item.sku;
    if (itemsku !== "") { 
        JsBarcode(barcodeLocation, itemsku, { 
            height: 100, 
            displayValue: true 
        });
    }
    displayContainer.appendChild(clone);
}

function fetchDataForSticker(item) {
    console.log(`${item.item_name} called from fetchDataForSticker function`);
}
function getBarcodeNUpdateDisplay(barcodeType, item, file = null){
    if (barcodeType === 'paper') { 
        fetchDataForPaper(item, file);
    } else { 
        fetchDataForSticker(item);
    }
}
export function displayCards(){
    const allItems = getAllItems();
    container.innerHTML = '';

    const frag = document.createDocumentFragment();

    allItems.forEach((item) => {
        const clone = itemCardTemplate.content.cloneNode(true);
        clone.querySelector('.js-itemName-barcode').textContent = item.item_name ?? '';
        clone.querySelector('.js-itemSKU-barcode').textContent = item.sku ?? '';
        
        const paperBtn = clone.querySelector('.paper-barcode-button');
        const inputFile = clone.querySelector('.paper-barcode-input');
        const fileName = clone.querySelector('.js-file-name');

        let uploadedFile = null;
        if (inputFile) {
            inputFile.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    uploadedFile = file;
                    if (fileName) {  fileName.textContent = String(file.name); }
                } else {
                    uploadedFile = null;
                    if (fileName) {  fileName.textContent = ''; }
                }
            });
        }
        if (paperBtn) {
            paperBtn.addEventListener('click', () => {
                getBarcodeNUpdateDisplay("paper", item, uploadedFile);
            });
        }
        // const stickerBtn = clone.querySelector('.sticker-barcode-button');
        // if (stickerBtn) {
        //     stickerBtn.addEventListener('click', () => {
        //         getBarcodeNUpdateDisplay("sticker", item);
        //     });
        // }
        frag.append(clone);
    });
    container.appendChild(frag);
}
// function fetchDataForPaper(item, file){
//     displayContainer.innerHTML = '';
//     const clone = paperBarcodeTemplate.content.cloneNode(true)
//     clone.querySelector('.js-barcode-item-name').textContent = item.item_name ?? '';
//     clone.querySelector('.js-barcode-item-price').textContent = formatCurrency(item.selling_price) ?? '';
//     const itemImg = clone.querySelector('.item-img');
//     if (itemImg) {
//         const objectUrl = URL.createObjectURL(file);
//         itemImg.src = objectUrl;
//         itemImg.dataset.objectUrl = objectUrl;
//     }
//     const barcodeLocation = clone.querySelector('.barcode');
//     const itemsku = item.sku;
//     if (itemsku !== "") { JsBarcode(barcodeLocation, itemsku, { height: 100, displayValue: true }) }
//     displayContainer.appendChild(clone);
// }

// function fetchDataForSticker(item){
//     console.log(`${item} called from fetchDataForSticker function`)
// }
// function getBarcodeNUpdateDisplay(barcodeType, item, file){
//     if(barcodeType === 'paper'){ fetchDataForPaper(item, file);}
//     else{ fetchDataForSticker(item) }
// }

// export function displayCards(){
//     const allItems = getAllItems();
//     container.innerHTML = '';         
//     const frag = document.createDocumentFragment();

//     allItems.forEach((item) => {
//         const clone = itemCardTemplate.content.cloneNode(true)
//         clone.querySelector('.js-itemName-barcode').textContent = item.item_name?? '';
//         clone.querySelector('.js-itemSKU-barcode').textContent = item.sku ?? '';
//         const paperBtn = clone.querySelector('.paper-barcode-button');
//         // const stickerBtn = clone.querySelector('.sticker-barcode-button');
//         const inputFile = clone.querySelector('.paper-barcode-input');
//         const fileName = clone.querySelector('.js-file-name');
//         if(inputFile){
//             inputFile.addEventListener('change', (e) => {
//                 const file = e.target.files?.[0];
//                 if (!file) {return;}
//                 // console.log(itemImg);  
//                 if(fileName) { fileName.textContent = String(file.name); }
//                 paperBtn.addEventListener('click', () => {
//                     getBarcodeNUpdateDisplay("paper", item, file)
//                     // console.log('Paper barcode clicked:', item.item_name);
//                 });
//             })
//         }

//         paperBtn.addEventListener('click', () => {
//             // getBarcodeNUpdateDisplay("paper", item, inputFile)
//             alert('Please upload an Image first');
//         });
    
//         // stickerBtn.addEventListener('click', () => {
//         //     getBarcodeNUpdateDisplay("sticker", item)
//         //     console.log('Sticker barcode clicked:', item.item_name);
//         // });
        
//         frag.append(clone)
//     })
//     container.appendChild(frag);
// }

const formatCurrency = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
}).format(value);

export function openBarcodeGenerator(){
    displayCards()
    const modal = document.getElementById('barcodeGeneratorModal');   // the whole overlay
    modal.addEventListener('click', function (event) {
        if(event.target === modal){
            closeBarcodeGenerator();
        }
    })
    modal.style.display = 'flex';
}

export function closeBarcodeGenerator(){
    const modal = document.getElementById('barcodeGeneratorModal');
    modal.style.display = 'none';
    cleanupObjectUrls();
}