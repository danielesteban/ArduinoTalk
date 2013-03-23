ARDUINO_PORT = /dev/tty.usbserial*

ARDUINO_SKETCHBOOK = .
ARDUINO_DIR = /Applications/Arduino.app/Contents/Resources/Java
ARDMK_DIR = ./libraries/Makefile
MONITOR_BAUDRATE = 19200

BOARD_TAG = attiny85-8
BOARDS_TXT = ./hardware/attiny/boards.txt
ARDUINO_VAR_PATH = ./hardware/attiny/variants
ISP_PROG = -c stk500v1
ISP_PORT = $(ARDUINO_PORT)
AVRDUDE_ARD_BAUDRATE = $(MONITOR_BAUDRATE)
AVRDUDE_CONF = $(AVR_TOOLS_DIR)/etc/avrdude.conf -b $(AVRDUDE_ARD_BAUDRATE)

ARDUINO_LIBS = VirtualWire SoftwareSerial

include ./libraries/Makefile/arduino-mk/Arduino.mk
