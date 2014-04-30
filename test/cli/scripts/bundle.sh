### A test for the parcelify bundle generation functionality
###  This file is only to be sourced from other files, not directly executed.

## test to see if we have the necessary variables
if [ -z "$PARCELIFY" ]
then
    echo "Could not locate the parcelify executable."
    echo "This should not be executed directly, only as part of the cli tests."
    exit 1
fi

function BUNDLE_TEST() {
    BUNDLE_FILENAME=$1         # the output filename.
    BUNDLE_PARCELIFY_ARG=$2    # one of -j, -c, or -t.

    # Error checking of the passed in arguments.
    if [ -z "$BUNDLE_FILENAME" ]
    then
	echo "Failed to find the bundle filename in BUNDLE_TEST()"
	exit 1
    fi
    if [ -z "$BUNDLE_PARCELIFY_ARG" ]
    then
	echo "Failed to find the bundle parcelify arg in BUNDLE_TEST()"
	exit 1
    fi

    # if we have an output around we want to remove it.
    if [ -e $BUNDLE_FILENAME ]
    then
	debug_echo "Cleaning up old bundle file: $BUNDLE_FILENAME."
	rm $BUNDLE_FILENAME
    fi

    debug_echo "Executing the following parcelify command:"
    debug_echo "  $PARCELIFY $MAINJS $DEBUG_PARCELIFY $BUNDLE_PARCELIFY_ARG $BUNDLE_FILENAME"

    # execute the parcelify command.
    $PARCELIFY $MAINJS $DEBUG_PARCELIFY $BUNDLE_PARCELIFY_ARG $BUNDLE_FILENAME
    PARCELIFY_RETURN=$?
    debug_echo "executing parcelify returned: $PARCELIFY_RETURN"

    # check our return code.
    if [ $PARCELIFY_RETURN != 0 ]
    then
	echo "parcelify failed to return a non-zero exit code: $PARCELIFY_RETURN"
	exit 1
    fi

    # make sure we have a bundle file and that it's non-zero.
    if [ ! -e $BUNDLE_FILENAME ]
    then
	echo "Failed to generate bundle file: $BUNDLE_FILENAME"
	exit 1
    elif [ ! -s $BUNDLE_FILENAME ]
    then
	echo "Failed to generate a bundle file with any content: $BUNDLE_FILENAME"
	exit 1
    fi

    ## TODO test content of BUNDLE_FILENAME
}
