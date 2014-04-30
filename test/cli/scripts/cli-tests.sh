#!/bin/bash

## A function to print out a help message.
function help() {
    echo ""
    echo "$0 -pmnMjctwdh"
    echo " -p path to the parcelify binary, defaults to `which parcelify`"
    echo " -m path to the main.js file to bundle, defaults to ./main.js"
    echo " -n path to the node_module used by main.js"
    echo " -j test with the provided jsBundle"
    echo " -c test with the provided cssBundle"
    echo " -t test with the provided tmplBundle"
    echo " -w test the watch functionality"
    echo " -d print debugging information about the testing, passed to parcelify."
    echo " -h print this message."
}

## Setup a few variables with default values.
CLI_TESTS="$( dirname "${BASH_SOURCE[0]}" )"
PARCELIFY=`which parcelify`
PARENTDIR=".."
NODE_MODULES="$PARENTDIR/node_modules"
MY_MODULE="$NODE_MODULES/my-module/"
MAINJS="$PARENTDIR/main.js"
JSBUNDLE=
CSSBUNDLE=
TMPLBUNDLE=
WATCH=
DEBUG=0
DEBUG_PARCELIFY=""

## A function for simplifying printing of debugging statements.
function debug_echo() {
    if [ $DEBUG == 1 ]
    then
	echo "$1"
    fi
}

## Deal with user provided arguments.
while getopts "p:m:n:j:c:t:w:dh" arg
do
    case $arg in
	\?)
	    help
	    exit 1
	    ;;
	h)
	    help
	    exit 0
	    ;;
	p)
	    PARCELIFY=$OPTARG
	    ;;
	m)
	    MAINJS=$OPTARG
	    ;;
	n)
	    MY_MODULE=$OPTARG
	    ;;
	j)
	    JSBUNDLE=$OPTARG
	    ;;
	c)
	    CSSBUNDLE=$OPTARG
	    ;;
	t)
	    TMPLBUNDLE=$OPTARG
	    ;;
	w)
	    WATCH=$OPTARG
	    ;;
	d)
	    DEBUG=1
	    DEBUG_PARCELIFY="-d"
	    ;;
    esac
done

## Print out variable debugging information.
debug_echo "Debugging enabled."
debug_echo "  Variables:"
debug_echo "        CLI_TESTS: $CLI_TESTS"
debug_echo "        PARCELIFY: $PARCELIFY"
debug_echo "        MY_MODULE: $MY_MODULE"
debug_echo "           MAINJS: $MAINJS"
debug_echo "         JSBUNDLE: $JSBUNDLE"
debug_echo "        CSSBUNDLE: $CSSBUNDLE"
debug_echo "       TMPLBUNDLE: $TMPLBUNDLE"
debug_echo "            WATCH: $WATCH"
debug_echo "            DEBUG: $DEBUG"
debug_echo "  DEBUG_PARCELIFY: $DEBUG_PARCELIFY"
debug_echo ""

## Do error checking of variables
debug_echo "Error checking variables."
# Do we have a directory for our cli tests?
if [ ! -d "$CLI_TESTS" ]
then
    echo "Failed to locate the directory with the cli tests!"
    exit 1
fi
# Do we have a parcelify binary?
if [ ! -x "$PARCELIFY" ]
then
    echo "Failed to locate the parcelify executable"
    help
    exit 1
fi
# Do we have a main.js file?
if [ ! -e "$MAINJS" ]
then
    echo "Failed to locate the main.js file."
    help
    exit 1
fi
# Do we know the path to the node_module used by main.js?
if [ ! -d "$MY_MODULE" ]
then
    echo "Failed to locate the the node module directory."
    help
    exit
fi
# See if we have been provided with a task
if [ -z "$JSBUNDLE" -a -z "$CSSBUNDLE" -a -z "$TMPLBUNDLE" -a -z "$WATCH" ]
then
    echo "No tests have been provided."
    help
    exit 1
fi
debug_echo "variables are free of errors."
debug_echo ""

## Call the tests:
#   jsBundle tests
if [ ! -z "$JSBUNDLE" ]
then
    debug_echo "Running the jsBundle tests."
    source "$CLI_TESTS/bundle.sh"
    BUNDLE_TEST "$JSBUNDLE" "-j"
    debug_echo ""
fi
#   cssBundle tests
if [ ! -z "$CSSBUNDLE" ]
then
    debug_echo "Running the cssBundle tests"
    source "$CLI_TESTS/bundle.sh"
    BUNDLE_TEST "$CSSBUNDLE" "-c"
    debug_echo ""
fi
#   tmplBundle tests
if [ ! -z "$TMPLBUNDLE" ]
then
    debug_echo "Running the tmplBundle tests."
    source "$CLI_TESTS/bundle.sh"
    BUNDLE_TEST "$TMPLBUNDLE" "-t"
    debug_echo ""
fi
#   watch tests
if [ ! -z "$WATCH" ]
then
    debug_echo "Running the watch tests."
    source "$CLI_TESTS/watch.sh"
    WATCH_TEST
    debug_echo ""
fi

debug_echo "All finished, exiting."

## Exit when done.
exit 0
