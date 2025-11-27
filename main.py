def add_two_numbers(a, b):
    """
    Add two numbers and return the result.

    Args:
        a: First number
        b: Second number

    Returns:
        The sum of a and b
    """
    return a + b


def main():
    # Example usage of add_two_numbers
    num1 = 5
    num2 = 3
    result = add_two_numbers(num1, num2)
    print(f"The sum of {num1} and {num2} is: {result}")

    # Interactive example
    try:
        user_num1 = float(input("Enter the first number: "))
        user_num2 = float(input("Enter the second number: "))
        user_result = add_two_numbers(user_num1, user_num2)
        print(f"The sum of {user_num1} and {user_num2} is: {user_result}")

    except ValueError as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
