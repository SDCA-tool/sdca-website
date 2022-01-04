#!/usr/bin/env Rscript


# Load Package
library(sdca)

# Get data values from STDIN
# See: https://datafireball.com/2013/10/10/putting-your-r-code-into-pipeline/comment-page-1/
input = file('stdin', 'r');
args = readLines(input, n=1, warn=FALSE)

# Process the data
result = try(process_results(args), silent = TRUE)

# Check if the function worked
if("try-error" %in% class(result)){
  result = list(error = gsub("[\r\n]", "", result[1]))
  result = jsonlite::toJSON(result)
}

# Print the result, without newlines or a count
cat(result)


