const generateBtn = document.querySelector(".generate-btn");
const generateBarcode = () => {
    console.log("Hello barcode");
    const input = document.querySelector(".barcode-input").value;
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
generateBtn.addEventListener("click", generateBarcode); 