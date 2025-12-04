const generateBarcode = () => {
    console.log("Hello barcode");
    const input = "sku-123455504";
    if(input.trim() !== ""){
        JsBarcode(".barcode", input, {
            height: 100,
            displayValue: true,
        });
    }
    else{
        alert("please enter a valid text or number to generate the barcode");
    }
}

generateBarcode();