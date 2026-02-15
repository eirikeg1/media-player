# Claude Development Guidelines

## Code Quality Standards (MANDATORY)

### Core Principles
- **Readable**: Write clear, self-documenting code
- **DRY**: Don't Repeat Yourself - eliminate code duplication
- **KISS**: Keep It Simple, Stupid - prefer simple solutions over complex ones
- **Best Practices**: Always follow established patterns and conventions
- **Avoid Technical Debt**: Ensure the solutions created are scalable, so that it is easy and clean to extend further down the line

### Development Approach
- **Incremental Changes**: Do smaller things at one time
- **Ask Before Deviating**: Only do what is asked for. If you think it's a bad choice, ask and explain your recommendations
- **Follow Existing Patterns**: Study the codebase conventions before making changes

### Quality Assurance (MANDATORY)
After implementing ANY change:

1. **Run All Checks**: Execute linting, TypeScript, and other error checks
2. **Fix All Issues**: Address every error, warning, and issue found
3. **Repeat Until Clean**: Continue running checks and fixing issues until there are no more
4. **Never Leave Broken Code**: Code must be in a working state after changes

### Commands to Run
- Linting: `npx expo lint`
- TypeScript: `npm run typecheck`
- Tests: (check package.json or README for test commands)

## Project-Specific Guidelines (MANDATORY)

### Component Architecture
- **Use React Native Reusables**: Always prefer existing UI components (`src/components/ui/`) over creating new ones. Utilize https://reactnativereusables.com/docs/components/
- **Domain-Driven Structure**: Follow the established pattern: `src/components/domain/{feature}/`
- **Themed Components**: Use existing themed components (ThemedText, ThemedView) for consistency

### State Management
- **Zustand Stores**: Use Zustand for state management following existing store patterns
- **Repository Pattern**: Interact with data through repository classes, not direct database calls
- **Error Handling**: Follow existing error handling patterns with try-catch and user-friendly messages

### Database Design
- **Modular SQLite**: Split functionality into multiple specialized .db files where appropriate
- **Multiple Tables**: Use multiple tables within databases for proper data organization
- **Repository Layer**: Always use repository pattern for database interactions

### Styling & UI
- **Tailwind + NativeWind**: Use the established Tailwind CSS system with NativeWind
- **Design System**: Follow existing color scheme, spacing, and component variants
- **Platform Consistency**: Ensure components work across iOS/Android following existing patterns

### Code Integration
- **Match Existing Patterns**: Study similar components/features before implementing
- **Expo Router**: Use expo-router navigation patterns consistently
- **TypeScript**: Maintain strict typing following existing type definitions

### Failure to Follow Guidelines
Not following these guidelines is unacceptable. Code quality and error-free implementation are non-negotiable requirements.

### Follow Official documentation
When making decisions for how to implement project/framework specific changes, the expo documentation should be used to ensure best practices. Spend some time navigating relevant pages on url `docs.expo.dev` before making any final decisions.
