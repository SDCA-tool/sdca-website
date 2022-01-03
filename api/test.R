#!/usr/bin/env Rscript


# Algorithm function
process_results = function(args) {
	values = unlist(strsplit(args, ','))
	result = length(values)
}

# Get data values from STDIN
# See: https://datafireball.com/2013/10/10/putting-your-r-code-into-pipeline/comment-page-1/
input = file('stdin', 'r');
args = readLines(input, n=1, warn=FALSE)

# Process the data
result = process_results(args)

# Print the result, without newlines or a count
cat(result)


