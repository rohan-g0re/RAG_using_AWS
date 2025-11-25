## Predefined Policies

1. AmazonBedrockFullAccess
2. AmazonS3FullAccess
3. AWSLambdaBasicExecutionRole


## Inline Policies (Custom)

1. To allow lambda functions to invoke each other

```
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": "lambda:InvokeFunction",
			"Resource": "*"
		}
	]
}
```


2. To allow querying vectors

```
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "AllowQueryOnPaperVectors",
			"Effect": "Allow",
			"Action": [
				"s3vectors:QueryVectors",
				"s3vectors:GetVectors"
			],
			"Resource": "*"
		}
	]
}
```

3. Again, to query and get vectors

```
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": [
				"s3vectors:PutVectors",
				"s3vectors:ListVectors",
				"s3vectors:GetVectors"
			],
			"Resource": "*"
		}
	]
}
```

4. For a lambda to access secrets from secreat manager 

```
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": [
				"secretsmanager:GetSecretValue"
			],
			"Resource": "*"
		}
	]
}
```