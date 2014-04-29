### A test for the parcelify watch functionality.
###   This file is only to be sourced from other files, not directly executed.

## test to see if we have the necessary variables
if [ -z "$PARCELIFY" ]
then
    echo "Could not locate the parcelify executable."
    echo "This should not be executed directly, only as part of the cli tests."
    exit 1
fi

function GET_FILE_TIMESTAMP() {
    eval "$1=`stat -r $2 | awk '{print $11}'`" # ugly and only tested w/ OSX bash!
}

function WATCH_TEST() {
    debug_echo "Executing the following parcelify command:"
    debug_echo "  $PARCELIFY $MAINJS $DEBUG_PARCELIFY -w -c $WATCH &"

    $PARCELIFY $MAINJS $DEBUG_PARCELIFY -w -c $WATCH &

    # capture the process id, so that we can end the process in the future.
    PARCELIFY_PID=$!
    debug_echo "  PID: $PARCELIFY_PID"

    # setup a mechanism to kill parcelify if we exit.
    trap "kill $PARCELIFY_PID" EXIT

    # wait a few seconds for parcelify to do something.
    debug_echo "waiting 1 second for parcelify to output it's file."
    ## TODO this is not a solution in that it may take more than 2 seconds to
    ## generate an initial bundle file.  For now it is good enough to proceed.
    sleep 1

    # collect the timestamp of the current bundle file that will be updated.
    GET_FILE_TIMESTAMP INITIAL_TIMESTAMP $WATCH
    debug_echo "Initial timestamp is $INITIAL_TIMESTAMP"

    # make a name for a temp css file in my_module to hold new content.
    TEMPCSSFILE="$MY_MODULE/$RANDOM.css"
    
    # Unless debugging, update our trap to remove the temp file we are creating.
    if [ $DEBUG != 1 ]
    then
	trap "kill $PARCELIFY_PID; rm $TEMPCSSFILE" EXIT
    else
	debug_echo "Created tempfile: $TEMPCSSFILE."
	debug_echo "!! In debug mode we do not clean up these files upon error !!"
    fi
    
    # add content to the temp css file
    debug_echo "Adding a yellow color to h1 tags in tempfile: $TEMPCSSFILE"
    echo "h1 { color: yellow }" > $TEMPCSSFILE

    debug_echo "Sleeping for 3 seconds to be sure watchify picks up on it."
    sleep 3

    # check our second timestamp
    GET_FILE_TIMESTAMP SECOND_TIMESTAMP $WATCH
    debug_echo "Second timestamp is $SECOND_TIMESTAMP"

    # do some error testing.
    if [ -z "$SECOND_TIMESTAMP" ]
    then
	echo "Failed to fetch second timestamp from $WATCH"
	exit 1
    elif [ $SECOND_TIMESTAMP -eq $INITIAL_TIMESTAMP ]
    then
	echo "$WATCH has not been updated via watchify."
	exit 1
    elif [ $SECOND_TIMESTAMP -lt $INITIAL_TIMESTAMP ]
    then
	echo "Second timestamp is less than initial timestamp, this shouldn't be."
	exit 1
    fi

    # test the contents of the generated file
    debug_echo "Testing the contents of $WATCH for the word 'yellow'"
    YELLOW=`grep "yellow" $WATCH`
    if [ -z "$YELLOW" ]
    then
	echo "Failed to find the new content in the updated css file: $WATCH"
	exit 1
    fi

    # we now know that watch picked up on our change.
    # Let's remove the tmp file and see if it picks up on that.
    debug_echo "Removing temp file $TEMPCSSFILE"
    rm $TEMPCSSFILE
    
    if [ -e $TEMPCSSFILE ]
    then
	echo "Failed to remove the temporary css file: $TEMPCSSFILE"
	exit 1
    elif [ $DEBUG != 1 ]
    then
	# adjust the trap to no longer try to remove the tmpfile.
	trap "kill $PARCELIFY_PID" EXIT
    fi

    debug_echo "waiting 3 seconds for watchify to pickup on the missing css file."
    sleep 3

    # Get a third timestamp and compair with the second timestamp.
    GET_FILE_TIMESTAMP THIRD_TIMESTAMP $WATCH
    debug_echo "Third timestamp is $THIRD_TIMESTAMP"
    
    # do some error testing.
    if [ -z "$THIRD_TIMESTAMP" ]
    then
	echo "Failed to fetch third timestamp of file $WATCH"
	exit 1
    elif [ $THIRD_TIMESTAMP -eq $SECOND_TIMESTAMP ]
    then
	echo "$WATCH has not been updated via watchify."
	exit 1
    elif [ $THIRD_TIMESTAMP -lt $SECOND_TIMESTAMP ]
    then
	echo "Third timestamp is less than initial timestamp, this shouldn't be."
	exit 1
    fi

    # test that the contents of the generated file
    debug_echo "Testing the contents of $WATCH for the lack of the word 'yellow'."
    YELLOW=`grep "yellow" $WATCH`
    if [ ! -z "$YELLOW" ]
    then
	echo "Found old content in the updated css file: $WATCH."
	exit 1
    fi

    ## TODO test watching jsBundles and tmplBundles by 
    ## extrapolating the common functionality from above.

}
