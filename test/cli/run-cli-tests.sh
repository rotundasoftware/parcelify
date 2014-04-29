#!/bin/bash

CURRENTDIR="$( dirname "${BASH_SOURCE[0]}" )"
PARCELIFY="$CURRENTDIR/../../bin/cmd.js"
SCRIPTS="$CURRENTDIR/scripts"
MAINJS="$CURRENTDIR/main.js"
MYMODULE="$CURRENTDIR/node_modules/my-module/"
WATCHBUNDLE="$CURRENTDIR/watchBundle.css"
JSBUNDLE="$CURRENTDIR/jsBundle.js"
CSSBUNDLE="$CURRENTDIR/cssBundle.css"
DEBUG=""

while getopts "hdpc" arg
do
    case $arg in
	\?|h)
	    echo "$0 -hdc"
	    echo "  -h: this help menu."
	    echo "  -c: clean up old bundle files and exit."
	    echo "  -p: specify the path to the parcelify executable."
	    echo "  -d: run the tests with debugging."
	    echo "    : without arguments runs the suite without debugging."
	    exit 0
	    ;;
	c)
	    rm $WATCHBUNDLE $JSBUNDLE $CSSBUNDLE $TMPLBUNDLE
	    exit 0
	    ;;
	d)
	    DEBUG="-d"
	    ;;
    esac
done

$SCRIPTS/cli-tests.sh $DEBUG \
    -m $MAINJS \
    -p $PARCELIFY \
    -n $MYMODULE \
    -w $WATCHBUNDLE \
    -j $JSBUNDLE \
    -c $CSSBUNDLE

