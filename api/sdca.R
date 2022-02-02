#!/usr/bin/Rscript

# Check if new version of R package exists
remotes::install_github("sdca-tool/sdca-package", upgrade = "never", quiet = TRUE)

# Load Package
library(sdca)

# Get data values from STDIN
# See: https://datafireball.com/2013/10/10/putting-your-r-code-into-pipeline/comment-page-1/
input = file('stdin', 'r')
args = try(readLines(input, warn=FALSE), silent = TRUE)

# Check if the input arrived
if("try-error" %in% class(args)){
  cat(jsonlite::toJSON(list(error = gsub("[\r\n]", "", result[1]))))
} else if (length(args) == 0){
  cat(jsonlite::toJSON(list(error = "API returned empty result")))
} else {
  args = paste(args, collapse = "")
  
  # Process the data
  result = try(
    suppressMessages(suppressWarnings(process_results(args, file = FALSE))), silent = TRUE)

  # Check if the function worked
  if("try-error" %in% class(result)){
    result = list(error = gsub("[\r\n]", "", result[1]))
    result = jsonlite::toJSON(result)
  }
  
  # Print the result, without newlines or a count
  cat(result)
}
