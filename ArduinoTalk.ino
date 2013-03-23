#include <VirtualWire.h>
#include <SoftwareSerial.h>

#define RadioRxPin 2
#define RadioTxPin 1

#define SerialRxPin 3
#define SerialTxPin 4

SoftwareSerial Serial(SerialRxPin, SerialTxPin);

uint8_t txBuf[VW_MAX_MESSAGE_LEN],
	txBufLen = 0,
	txBufIndex = 0;

void setup() {
	pinMode(SerialRxPin, INPUT);
	pinMode(SerialTxPin, OUTPUT);
	Serial.begin(19200);

	vw_set_rx_pin(RadioRxPin);
	vw_set_tx_pin(RadioTxPin);
	vw_setup(2000);
	vw_rx_start();
}

void loop(void) {
	uint8_t rxBuf[VW_MAX_MESSAGE_LEN],
		rxBuflen = VW_MAX_MESSAGE_LEN;

	if(vw_have_message() && vw_get_message(rxBuf, &rxBuflen)) {
		Serial.write(rxBuflen);
		for(byte x=0; x<rxBuflen; x++) Serial.write(rxBuf[x]);		
	}

	while(Serial.available()) {
		if(txBufLen == 0) txBufLen = Serial.read();
		else {
			txBuf[txBufIndex] = Serial.read();
			txBufIndex++;
			if(txBufIndex == txBufLen) {
				vw_send(txBuf, txBufLen);
				txBufLen = txBufIndex = 0;
			}
		}
	}
}
